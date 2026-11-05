/**
 * The economy. Runs once per cycle (1 game hour) and once per day.
 * All functions mutate a draft that the caller owns (see draft.ts).
 */
import { BUSINESSES, PRODUCT_INFO, RESEARCH_STEP, RESEARCH_UNLOCKS } from "./business";
import { COMPUTE_PER_WORKER, CYCLES_PER_DAY, DEFAULT_BUDGET, RENT_PER_FLOOR } from "./constants";
import { bubble, clamp, earn, log, newLedger, otherIncome, say, spend } from "./draft";
import { expireEvents, maybeTriggerEvent, removeWorker } from "./events";
import { line } from "./lines";
import { runMissions } from "./missions";
import { runFactory } from "./products";
import { dayOf } from "./time";
import type { BusinessId, Economy, GameState, Worker } from "./types";
import { effects } from "./upgrades";

type Rng = () => number;

export interface CycleOptions {
  offline: boolean;
}

export function newEconomy(day: number): Economy {
  const budgets = { shop: DEFAULT_BUDGET, freelance: DEFAULT_BUDGET, music: DEFAULT_BUDGET, social: DEFAULT_BUDGET, research: DEFAULT_BUDGET };
  return {
    businesses: {
      shop: { totalRevenue: 0, fans: 0, followers: 0, points: 0, efficiency: 0 },
      freelance: { totalRevenue: 0, fans: 0, followers: 0, points: 0, efficiency: 0 },
      music: { totalRevenue: 0, fans: 1500, followers: 0, points: 0, efficiency: 0 },
      social: { totalRevenue: 0, fans: 0, followers: 2000, points: 0, efficiency: 0 },
      research: { totalRevenue: 0, fans: 0, followers: 0, points: 0, efficiency: 0 },
    },
    budgets,
    today: newLedger(day),
    history: [],
    modifiers: [],
    investorShare: 0,
    unlocked: ["tshirt", "song", "video"],
    autoApprove: false,
    lastCycleRevenue: 0,
    unpaidDays: 0,
    otherIncome: 0,
    launched: { tshirt: 0, candle: 0, poster: 0, song: 0, video: 0 },
  };
}

// ---------------------------------------------------------------- factors

/** A worker's output for the cycle that just ended (0 when they did not work). */
export function workerOutput(w: Worker, now: number): number {
  const workFrac = clamp(w.cycleWork / 60, 0, 1);
  const skill = 0.5 + w.skill / 100;
  const mood = 0.6 + w.mood / 250;
  const boost = w.boost && w.boost.until > now ? w.boost.mult : 1;
  return workFrac * skill * mood * boost;
}

/** Diminishing returns on department budget ($/day). */
export function budgetFactor(perDay: number): number {
  return 1 + 0.6 * (1 - Math.exp(-Math.max(0, perDay) / 200));
}

/** Social reach lifts demand for every business. */
export function demandFactor(followers: number): number {
  return Math.max(0.8, 1 + 0.25 * Math.log10(Math.max(1, followers) / 2000));
}

export function hasOutage(s: GameState): boolean {
  return s.economy.modifiers.some((m) => m.outage && m.until > s.minutes);
}

function modFactor(s: GameState, business: BusinessId): number {
  let f = 1;
  for (const m of s.economy.modifiers) {
    if (m.outage || m.productId || m.until <= s.minutes) continue;
    if (m.business === business || m.business === "all") f *= m.mult;
  }
  return f;
}

function productMod(s: GameState, productId: string): number {
  let f = 1;
  for (const m of s.economy.modifiers) if (m.productId === productId && m.until > s.minutes) f *= m.mult;
  return f;
}

/** Shop sales per cycle for one live product (units). */
export function productUnits(quality: number, ageDays: number, demand: number): number {
  const freshness = Math.max(0.25, 1 - ageDays * 0.05);
  return 0.12 * (quality / 70) * demand * freshness;
}

// ---------------------------------------------------------------- per cycle

export interface CycleReport {
  revenue: Record<BusinessId, number>;
  outputs: Map<string, number>;
}

/** Book one cycle of revenue and running costs. */
export function runCycle(s: GameState, rng: Rng, opts: CycleOptions): CycleReport {
  const e = s.economy;
  const now = s.minutes;
  const outputs = new Map<string, number>();
  const byFocus: Record<string, Worker[]> = {};
  const fx = effects(s);
  for (const w of s.workers) {
    const out = workerOutput(w, now) * fx.output(w);
    outputs.set(w.id, out);
    (byFocus[w.focus] ??= []).push(w);
    w.cycleWork = 0;
    w.mood = clamp(w.mood + (60 - w.mood) * 0.02);
    if (w.boost && w.boost.until <= now) w.boost = null;
  }
  const sumOut = (focus: string) => (byFocus[focus] ?? []).reduce((a, w) => a + (outputs.get(w.id) ?? 0), 0);

  const outage = hasOutage(s);
  const demand = demandFactor(e.businesses.social.followers);
  const ops = 1 + 0.12 * sumOut("ops");
  const efficiency = 1 + e.businesses.research.efficiency;
  const keep = 1 - e.investorShare;
  const common = (b: BusinessId) => budgetFactor(e.budgets[b]) * modFactor(s, b) * ops * efficiency * keep * (0.8 + rng() * 0.4);

  const revenue: Record<BusinessId, number> = { shop: 0, freelance: 0, music: 0, social: 0, research: 0 };

  // Freelance: gig payouts, sometimes a refund.
  const F = sumOut("freelance");
  revenue.freelance = 38 * F * demand * common("freelance");
  if (F > 0 && rng() < 0.03) {
    const refund = Math.round((40 + rng() * 60) * fx.eventCost);
    revenue.freelance -= refund;
    log(s, `A freelance client asked for a $${refund} refund.`, "bad");
  }

  // Shop: every live product sells a little, pushed by shop workers.
  const S = sumOut("shop");
  const push = 0.7 + 0.3 * Math.min(1.5, S);
  const shopCommon = common("shop") * push * fx.shopIncome;
  for (const p of s.products) {
    if (p.stage !== "done" || PRODUCT_INFO[p.type].business !== "shop") continue;
    const age = (now - (p.liveAt ?? now)) / (24 * 60);
    const units = productUnits(p.quality, age, demand) * productMod(s, p.id) * shopCommon;
    const r = units * PRODUCT_INFO[p.type].price;
    p.sales += units;
    p.revenue += r;
    revenue.shop += r;
  }

  // Music: fans stream; producers grow the fanbase.
  const M = sumOut("music");
  const music = e.businesses.music;
  music.fans += (M * music.fans * 0.004 + M * 5) * budgetFactor(e.budgets.music) * fx.musicGrowth;
  revenue.music = outage ? 0 : music.fans * 0.003 * demand * common("music") * fx.musicIncome;

  // Social: followers bring sponsorships and lift demand everywhere.
  const So = sumOut("social");
  const social = e.businesses.social;
  social.followers += (So * social.followers * 0.004 + So * 8) * budgetFactor(e.budgets.social) * fx.socialGrowth;
  revenue.social = social.followers * 0.002 * common("social") * fx.socialIncome;

  // Research: consulting income + points that unlock product lines.
  const R = sumOut("research");
  const research = e.businesses.research;
  if (!outage) {
    const before = Math.floor(research.points / RESEARCH_STEP);
    research.points += R * 0.6 * budgetFactor(e.budgets.research) * fx.researchRate;
    const after = Math.floor(research.points / RESEARCH_STEP);
    for (let i = before; i < after; i++) unlockNext(s, i);
    revenue.research = 15 * R * common("research");
  }

  // Wildcard experiments land in a random business with big variance.
  const W = sumOut("wild");
  if (W > 0) {
    const target = BUSINESSES[Math.floor(rng() * BUSINESSES.length)];
    if (!(outage && (target === "music" || target === "research"))) {
      revenue[target] += 25 * W * rng() * 2 * common(target);
    }
  }

  // Book revenue, crediting workers by their share of each business.
  for (const b of BUSINESSES) {
    const amount = Math.round(revenue[b] * 100) / 100;
    revenue[b] = amount;
    if (amount === 0) continue;
    const contributors = [...(byFocus[b] ?? []), ...(byFocus.wild ?? [])];
    const total = contributors.reduce((a, w) => a + (outputs.get(w.id) ?? 0), 0);
    earn(s, b, amount);
    if (total > 0) for (const w of contributors) w.earned += (amount * (outputs.get(w.id) ?? 0)) / total;
  }
  e.lastCycleRevenue = BUSINESSES.reduce((a, b) => a + revenue[b], 0);

  // Running costs: AI compute and department budgets.
  for (const w of s.workers) spend(s, "compute", COMPUTE_PER_WORKER, w);
  for (const b of BUSINESSES) spend(s, "budgets", e.budgets[b] / CYCLES_PER_DAY);

  runFactory(s, outputs, rng, { offline: opts.offline, paused: outage });
  runMissions(s, rng);

  // Expire modifiers, then maybe start a new event.
  e.modifiers = e.modifiers.filter((m) => m.until > now);
  expireEvents(s, rng);
  maybeTriggerEvent(s, rng, opts.offline);

  return { revenue, outputs };
}

function unlockNext(s: GameState, index: number): void {
  const research = s.economy.businesses.research;
  const next = RESEARCH_UNLOCKS[index] ?? "efficiency";
  if (next === "efficiency") {
    research.efficiency = Math.round((research.efficiency + 0.05) * 100) / 100;
    log(s, `🔬 Research breakthrough: +5% efficiency for every business.`, "good");
  } else if (!s.economy.unlocked.includes(next)) {
    s.economy.unlocked = [...s.economy.unlocked, next];
    log(s, `🔬 Research unlocked a new product line: ${PRODUCT_INFO[next].label}s.`, "good");
  }
}

// ---------------------------------------------------------------- per day

/** A fair daily salary for a skill level. */
export function fairSalary(skill: number): number {
  return 60 + skill * 2;
}

/** Close the day that just ended: payroll, rent, loyalty, history. */
export function runDay(s: GameState, rng: Rng): void {
  const e = s.economy;
  for (const w of s.workers) spend(s, "salaries", w.salary, w);
  spend(s, "rent", s.building.floors * RENT_PER_FLOOR);

  const bounced = s.cash < 0;
  if (bounced) {
    e.unpaidDays += 1;
    log(s, "Payroll pushed cash below zero. The crew is worried.", "bad");
  } else {
    e.unpaidDays = 0;
  }

  const fx = effects(s);
  if (fx.interestRate > 0 && s.cash > 0) {
    const interest = Math.round(Math.min(fx.interestCap, s.cash * fx.interestRate));
    if (interest > 0) {
      otherIncome(s, interest);
      log(s, `📈 The Trading Desk earned $${interest} on idle cash.`, "good");
    }
  }
  for (const w of [...s.workers]) {
    w.mood = clamp(w.mood + fx.dailyMood);
    w.loyalty = clamp(w.loyalty + fx.dailyLoyalty);
    const fair = fairSalary(w.skill);
    const payDelta = clamp(((w.salary - fair) / fair) * 10, -5, 5);
    const moodDelta = (w.mood - 50) / 25;
    w.loyalty = clamp(w.loyalty + payDelta + moodDelta - (bounced ? 8 : 0));
    if (bounced) {
      w.mood = clamp(w.mood - 10);
      say(s, w.id, line(w.id, "unpaid", rng));
    }
    if (w.loyalty < 10) {
      say(s, w.id, line(w.id, "quit", rng));
      removeWorker(s, w.id, "quit. Loyalty hit rock bottom.");
      continue;
    }
    if (w.loyalty < 20) {
      w.lowLoyaltyDays += 1;
      if (w.lowLoyaltyDays >= 3) {
        bubble(w, "angry", s.minutes, 120);
        say(s, w.id, line(w.id, "threatenQuit", rng));
        log(s, `${w.name} is threatening to quit.`, "bad");
      }
    } else {
      w.lowLoyaltyDays = 0;
    }
  }

  e.history = [...e.history, e.today].slice(-30);
  e.today = newLedger(dayOf(s.minutes));
}
