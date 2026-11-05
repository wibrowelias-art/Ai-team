/** Random events: each shows a popup with 2-3 choices and clear consequences. */
import { findRoom } from "./building";
import { BUSINESS_INFO, PRODUCT_INFO } from "./business";
import { reactToEvent } from "./chatter";
import { bubble, clamp, log, nextId, otherIncome, say, spend } from "./draft";
import { line } from "./lines";
import { pickSpot, sendWorker } from "./movement";
import type { BusinessId, GameEvent, GameState, Worker } from "./types";
import { effects } from "./upgrades";

type Rng = () => number;

/** ~2 events per game day. */
export const EVENT_CHANCE_PER_CYCLE = 2 / 24;
/** Unanswered events resolve themselves with the default choice after 12 game hours. */
export const EVENT_TIMEOUT_MIN = 12 * 60;
export const FOREVER = 1e12;
const MAX_PENDING = 2;

/** Event title without its emoji and trailing punctuation, for log lines. */
export function plainTitle(title: string): string {
  return title.replace(/[^\w\s'-]/gu, "").replace(/\s+/g, " ").trim();
}

type Kind = GameEvent["kind"];

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function avgDailyRevenue(s: GameState): number {
  const days = s.economy.history.slice(-3);
  if (days.length === 0) return s.economy.today.revenue;
  return days.reduce((a, d) => a + d.revenue, 0) / days.length;
}

function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

function create(s: GameState, kind: Kind, rng: Rng): GameEvent | null {
  const base = { id: nextId(s, "e"), kind, createdAt: s.minutes };
  switch (kind) {
    case "viral": {
      const live = s.products.filter((p) => p.stage === "done");
      const p = live.length > 0 ? pick(live, rng) : null;
      const business: BusinessId = p ? PRODUCT_INFO[p.type].business : "music";
      if (s.economy.modifiers.some((m) => m.label.startsWith("Viral") && m.business === business && m.until > s.minutes)) return null;
      const what = p ? p.name : "an old Pham track";
      const single = business === "shop" && p;
      // A shop product sells 10x; a viral song or video lifts its whole business 3x and grows the audience.
      s.economy.modifiers.push({
        id: nextId(s, "mod"),
        label: `Viral: ${what}`,
        business,
        mult: single ? 10 : 3,
        until: s.minutes + 24 * 60,
        productId: single ? p.id : undefined,
      });
      s.milestones = { ...s.milestones, virals: s.milestones.virals + 1 };
      const b = s.economy.businesses;
      if (business === "music") b.music.fans = Math.round(b.music.fans * 1.25);
      if (business === "social") b.social.followers = Math.round(b.social.followers * 1.25);
      return {
        ...base,
        title: "Viral hit! 🚀",
        body: single
          ? `${what} is blowing up online. It sells 10x for a day.`
          : `${what} is blowing up online. ${BUSINESS_INFO[business].name} income is 3x for a day and the audience grew 25%.`,
        choices: [
          { label: "Celebrate with the crew", detail: "Everyone +5 mood." },
          { label: "Pour fuel on it ($300)", detail: "Costs $300. Social followers +15%." },
        ],
        defaultChoice: 0,
        data: { business },
      };
    }
    case "refund":
      return {
        ...base,
        title: "Refund wave 😬",
        body: "A batch of freelance clients are unhappy and want their money back.",
        choices: [
          { label: "Refund them ($250)", detail: "Costs $250. Freelance income -30% for 12h." },
          { label: "Push back", detail: "Free. Freelance income -70% for 24h. Freelancers lose mood." },
        ],
        defaultChoice: 1,
        data: {},
      };
    case "investor": {
      if (s.economy.investorShare >= 0.4) return null;
      const amount = Math.min(25000, roundTo(1500 + avgDailyRevenue(s) * 3, 100));
      return {
        ...base,
        title: "Investor offer 💼",
        body: `A VC wants in: $${amount.toLocaleString("en-US")} cash now for 10% of all future revenue.`,
        choices: [
          { label: `Take $${amount.toLocaleString("en-US")}`, detail: "Cash now. 10% of every future dollar goes to the investor." },
          { label: "Decline", detail: "Keep 100% of the upside." },
        ],
        defaultChoice: 1,
        data: { amount },
      };
    }
    case "poaching": {
      if (s.workers.length < 3) return null;
      const sorted = [...s.workers].sort((a, b) => a.loyalty - b.loyalty);
      const w = rng() < 0.6 ? sorted[0] : pick(s.workers, rng);
      const cost = roundTo(w.salary * 4, 50);
      return {
        ...base,
        title: "Poaching attempt 🎣",
        body: `A rival startup offered ${w.name} a job. ${w.name}'s loyalty is ${Math.round(w.loyalty)}.`,
        choices: [
          { label: `Counter-offer ($${cost})`, detail: `Costs $${cost}. ${w.name} stays, +10% salary, +20 loyalty.` },
          { label: "Let them go", detail: `${w.name} leaves the company today.` },
          { label: "Trust their loyalty", detail: "Free. They stay if loyalty is 40+, otherwise they leave." },
        ],
        defaultChoice: 2,
        data: { workerId: w.id, cost },
      };
    }
    case "outage": {
      if (s.economy.modifiers.some((m) => m.outage)) return null;
      s.economy.modifiers.push({ id: nextId(s, "mod"), label: "Server outage", business: "all", mult: 1, until: FOREVER, outage: true });
      return {
        ...base,
        title: "Server outage ⚡",
        body: "The racks went dark. Factory production, Music and Research are paused until it is fixed.",
        choices: [
          { label: "Pay for a repair ($400)", detail: "Costs $400. Back online right away." },
          { label: "Patch it ourselves", detail: "Free, but it takes 8 hours." },
        ],
        defaultChoice: 1,
        data: {},
      };
    }
    case "drama": {
      if (s.workers.length < 2) return null;
      let pair: [Worker, Worker] | null = null;
      let worst = Infinity;
      for (const a of s.workers) {
        for (const b of s.workers) {
          if (a.id >= b.id) continue;
          const v = (a.relationships[b.id] ?? 0) + (b.relationships[a.id] ?? 0) + rng() * 30;
          if (v < worst) {
            worst = v;
            pair = [a, b];
          }
        }
      }
      if (!pair) return null;
      const [a, b] = pair;
      for (const w of pair) bubble(w, "angry", s.minutes, 60);
      return {
        ...base,
        title: "Worker drama 💢",
        body: `${a.name} and ${b.name} are arguing loudly about whose work matters more.`,
        choices: [
          { label: "Sort it out in the War Room", detail: "Both walk to the War Room. Relationship +25, mood +3." },
          { label: `Side with ${a.name}`, detail: `${a.name} +5 mood. ${b.name} -12 mood, -8 loyalty.` },
          { label: "Ignore it", detail: "Both -8 mood. Their relationship gets worse." },
        ],
        defaultChoice: 2,
        data: { a: a.id, b: b.id },
      };
    }
  }
}

const WEIGHTS: [Kind, number][] = [
  ["viral", 1],
  ["refund", 1],
  ["investor", 0.6],
  ["poaching", 0.8],
  ["outage", 0.8],
  ["drama", 1],
];

function pickKind(rng: Rng): Kind {
  const total = WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of WEIGHTS) {
    r -= w;
    if (r <= 0) return k;
  }
  return "drama";
}

/** Create an event of a given kind (exposed for tests and debugging). */
export function triggerEvent(s: GameState, kind: Kind, rng: Rng, offline = false): GameEvent | null {
  const ev = create(s, kind, rng);
  if (!ev) return null;
  s.pendingEvents = [...s.pendingEvents, ev];
  // Logged once, when it is resolved (see resolveEvent).
  if (offline) resolveEvent(s, ev.id, ev.defaultChoice, rng);
  return ev;
}

export function maybeTriggerEvent(s: GameState, rng: Rng, offline: boolean): void {
  if (s.pendingEvents.length >= MAX_PENDING) return;
  if (rng() >= EVENT_CHANCE_PER_CYCLE) return;
  triggerEvent(s, pickKind(rng), rng, offline);
}

export function expireEvents(s: GameState, rng: Rng): void {
  for (const ev of [...s.pendingEvents]) {
    if (s.minutes - ev.createdAt >= EVENT_TIMEOUT_MIN) resolveEvent(s, ev.id, ev.defaultChoice, rng);
  }
}

export function removeWorker(s: GameState, workerId: string, reason: string): void {
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return;
  s.workers = s.workers.filter((x) => x.id !== workerId);
  for (const m of s.missions) if (m.workerId === workerId && m.status === "active") m.status = "failed";
  for (const o of s.workers) {
    const rel = o.relationships[workerId] ?? 0;
    o.mood = clamp(o.mood - (rel > 20 ? 10 : 4));
  }
  log(s, `${w.name} ${reason}`, "bad");
}

/** Apply a choice. Mutates the draft. Returns an error message or null. */
export function resolveEvent(s: GameState, eventId: string, choice: number, rng: Rng): string | null {
  const ev = s.pendingEvents.find((e) => e.id === eventId);
  if (!ev) return "That event is already over.";
  if (choice < 0 || choice >= ev.choices.length) return "Invalid choice.";
  const d = ev.data;
  const now = s.minutes;

  switch (ev.kind) {
    case "viral":
      if (choice === 0) for (const w of s.workers) w.mood = clamp(w.mood + 5);
      else {
        spend(s, "events", Math.round(300 * effects(s).eventCost));
        const soc = s.economy.businesses.social;
        soc.followers = Math.round(soc.followers * 1.15);
      }
      break;
    case "refund": {
      const freelancers = s.workers.filter((w) => w.focus === "freelance");
      if (choice === 0) {
        spend(s, "events", Math.round(250 * effects(s).eventCost));
        s.economy.modifiers.push({ id: nextId(s, "mod"), label: "Refunds", business: "freelance", mult: 0.7, until: now + 12 * 60 });
        for (const w of freelancers) w.mood = clamp(w.mood - 3);
      } else {
        s.economy.modifiers.push({ id: nextId(s, "mod"), label: "Angry clients", business: "freelance", mult: 0.3, until: now + 24 * 60 });
        for (const w of freelancers) w.mood = clamp(w.mood - 8);
      }
      break;
    }
    case "investor":
      if (choice === 0) {
        otherIncome(s, Number(d.amount));
        s.economy.investorShare = Math.min(0.4, s.economy.investorShare + 0.1);
        log(s, `Took $${Number(d.amount).toLocaleString("en-US")} from investors for 10% of revenue.`, "good");
      }
      break;
    case "poaching": {
      const w = s.workers.find((x) => x.id === d.workerId);
      if (!w) break;
      const stays = choice === 0 || (choice === 2 && w.loyalty >= 40);
      if (choice === 0) {
        spend(s, "events", Math.round(Number(d.cost) * effects(s).eventCost), w);
        w.salary = Math.round(w.salary * 1.1);
        w.loyalty = clamp(w.loyalty + 20);
        w.mood = clamp(w.mood + 5);
      }
      if (stays) {
        say(s, w.id, line(w.id, "kept", rng));
        log(s, `${w.name} turned down the rival offer.`, "good");
      } else {
        say(s, w.id, line(w.id, "quit", rng));
        removeWorker(s, w.id, "left for a rival startup.");
      }
      break;
    }
    case "outage":
      if (choice === 0) {
        spend(s, "events", Math.round(400 * effects(s).eventCost));
        s.economy.modifiers = s.economy.modifiers.filter((m) => !m.outage);
        log(s, "Servers repaired.", "good");
      } else {
        for (const m of s.economy.modifiers) if (m.outage) m.until = now + 8 * 60;
      }
      break;
    case "drama": {
      const a = s.workers.find((x) => x.id === d.a);
      const b = s.workers.find((x) => x.id === d.b);
      if (!a || !b) break;
      const rel = (x: Worker, y: Worker, delta: number) => {
        x.relationships[y.id] = clamp((x.relationships[y.id] ?? 0) + delta, -100, 100);
      };
      if (choice === 0) {
        const war = findRoom(s.building, "war_room");
        for (const w of [a, b]) {
          w.mood = clamp(w.mood + 3);
          w.bubble = null;
          if (war) sendWorker(w, war, pickSpot(war, ["chair"], s.workers, rng, w.id) ?? 0, "visiting");
        }
        rel(a, b, 25);
        rel(b, a, 25);
        log(s, `${a.name} and ${b.name} talked it out in the War Room.`, "good");
      } else if (choice === 1) {
        a.mood = clamp(a.mood + 5);
        b.mood = clamp(b.mood - 12);
        b.loyalty = clamp(b.loyalty - 8);
        rel(a, b, -10);
        rel(b, a, -10);
      } else {
        a.mood = clamp(a.mood - 8);
        b.mood = clamp(b.mood - 8);
        rel(a, b, -15);
        rel(b, a, -15);
      }
      break;
    }
  }
  s.pendingEvents = s.pendingEvents.filter((e) => e.id !== eventId);
  log(s, `⚡ ${plainTitle(ev.title)}: ${ev.choices[choice].label}.`, "system");
  reactToEvent(s, ev, rng);
  return null;
}
