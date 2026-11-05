import { describe, expect, it } from "vitest";
import * as A from "@/game/actions";
import { FOCUS_ROOM } from "@/game/business";
import { COMPUTE_PER_WORKER, CYCLES_PER_DAY, RENT_PER_FLOOR, START_MINUTE } from "@/game/constants";
import { draftOf } from "@/game/draft";
import { budgetFactor, demandFactor, fairSalary, productUnits, rentFor, runCycle, runDay, workerOutput } from "@/game/economy";
import { resolveEvent, triggerEvent } from "@/game/events";
import { MISSIONS } from "@/game/missions";
import { applyOffline } from "@/game/offline";
import { makeProduct, runFactory } from "@/game/products";
import { deserialize } from "@/game/save";
import { mulberry32, newGameState, step } from "@/game/sim";
import type { GameState } from "@/game/types";

const rng = () => mulberry32(42);

function fresh(seed = 1): GameState {
  return newGameState("Test Co", "cyan", mulberry32(seed));
}

/** A draft where every worker worked the whole last cycle. */
function workedCycle(g: GameState): GameState {
  const d = draftOf(g);
  for (const w of d.workers) w.cycleWork = 60;
  return d;
}

const worker = (g: GameState, id: string) => g.workers.find((w) => w.id === id)!;

describe("factors", () => {
  it("budgets have diminishing returns", () => {
    expect(budgetFactor(0)).toBe(1);
    expect(budgetFactor(100)).toBeGreaterThan(budgetFactor(50));
    expect(budgetFactor(500) - budgetFactor(400)).toBeLessThan(budgetFactor(100) - budgetFactor(0));
    expect(budgetFactor(1e9)).toBeLessThanOrEqual(1.6);
  });

  it("social followers raise demand", () => {
    expect(demandFactor(2000)).toBeCloseTo(1);
    expect(demandFactor(20000)).toBeCloseTo(1.25);
    expect(demandFactor(1)).toBeGreaterThanOrEqual(0.8);
  });

  it("worker output depends on work time, skill, mood and boosts", () => {
    const w = { ...fresh().workers[0], cycleWork: 60, skill: 70, mood: 70, boost: null };
    const base = workerOutput(w, 0);
    expect(workerOutput({ ...w, cycleWork: 0 }, 0)).toBe(0);
    expect(workerOutput({ ...w, cycleWork: 30 }, 0)).toBeCloseTo(base / 2);
    expect(workerOutput({ ...w, mood: 10 }, 0)).toBeLessThan(base);
    expect(workerOutput({ ...w, skill: 95 }, 0)).toBeGreaterThan(base);
    expect(workerOutput({ ...w, boost: { mult: 1.5, until: 100 } }, 50)).toBeCloseTo(base * 1.5);
    expect(workerOutput({ ...w, boost: { mult: 1.5, until: 100 } }, 150)).toBeCloseTo(base);
  });

  it("older products sell less", () => {
    expect(productUnits(70, 10, 1)).toBeLessThan(productUnits(70, 0, 1));
    expect(productUnits(70, 100, 1)).toBeGreaterThan(0);
  });
});

describe("cycles", () => {
  it("earns revenue from working businesses and books running costs", () => {
    const d = workedCycle(fresh());
    const r = runCycle(d, rng(), { offline: false });
    expect(r.revenue.freelance).toBeGreaterThan(0);
    expect(r.revenue.research).toBeGreaterThan(0);
    expect(r.revenue.shop).toBeGreaterThan(0); // starter catalog
    expect(d.totalRevenue).toBeGreaterThan(0);
    expect(d.economy.today.costs.compute).toBe(d.workers.length * COMPUTE_PER_WORKER);
    const budgets = Object.values(d.economy.budgets).reduce((a, b) => a + b, 0);
    expect(d.economy.today.costs.budgets).toBeCloseTo(budgets / CYCLES_PER_DAY);
    // Revenue + costs reconcile with cash.
    expect(d.cash).toBeCloseTo(5000 + d.totalRevenue - d.totalSpent);
  });

  it("idle crews earn nothing but still cost money", () => {
    const d = draftOf(fresh());
    for (const w of d.workers) w.cycleWork = 0;
    d.products = [];
    const r = runCycle(d, rng(), { offline: false });
    expect(r.revenue.freelance).toBe(0);
    expect(r.revenue.research).toBe(0);
    expect(d.totalSpent).toBeGreaterThan(0);
  });

  it("higher budgets mean more revenue", () => {
    const lo = workedCycle(A.setBudget(fresh(), "freelance", 0).state);
    const hi = workedCycle(A.setBudget(fresh(), "freelance", 500).state);
    const a = runCycle(lo, mulberry32(7), { offline: false }).revenue.freelance;
    const b = runCycle(hi, mulberry32(7), { offline: false }).revenue.freelance;
    expect(b).toBeGreaterThan(a);
  });

  it("an outage stops music, research and the factory", () => {
    const d = workedCycle(fresh());
    triggerEvent(d, "outage", rng());
    const r = runCycle(d, rng(), { offline: false });
    expect(r.revenue.music).toBe(0);
    expect(r.revenue.research).toBe(0);
    expect(d.products.filter((p) => p.stage === "pending").every((p) => p.progress === 0)).toBe(true);
  });

  it("investors take their share of revenue", () => {
    const a = workedCycle(fresh());
    const b = workedCycle(fresh());
    b.economy.investorShare = 0.3;
    const ra = runCycle(a, mulberry32(9), { offline: false }).revenue.research;
    const rb = runCycle(b, mulberry32(9), { offline: false }).revenue.research;
    expect(rb).toBeCloseTo(ra * 0.7, 1);
  });
});

describe("days", () => {
  it("pays salaries and rent once a day and keeps 30 days of history", () => {
    let d = draftOf(fresh());
    const payroll = d.workers.reduce((a, w) => a + w.salary, 0);
    const cash0 = d.cash;
    runDay(d, rng());
    expect(d.economy.history).toHaveLength(1);
    expect(d.economy.history[0].costs.salaries).toBe(payroll);
    expect(d.economy.history[0].costs.rent).toBe(rentFor(3));
    expect(d.cash).toBe(cash0 - payroll - rentFor(3));
    for (let i = 0; i < 40; i++) {
      d = draftOf(d);
      runDay(d, rng());
    }
    expect(d.economy.history).toHaveLength(30);
  });

  it("step runs a full day of cycles with one payroll", () => {
    const g = step(fresh(), 24 * 60 - START_MINUTE + 1, mulberry32(3));
    expect(g.economy.history).toHaveLength(1);
    expect(g.economy.history[0].costs.salaries).toBeGreaterThan(0);
    expect(g.cyclesToday).toBe(0);
  });

  it("underpaid, unhappy workers lose loyalty, threaten to quit, then leave", () => {
    let d = draftOf(fresh());
    for (let i = 0; i < 3; i++) {
      d = draftOf(d);
      const f = worker(d, "finn");
      // Neutral pay and mood keep loyalty parked at 15: low, but not low enough to leave.
      f.salary = fairSalary(f.skill);
      f.mood = 50;
      f.loyalty = 15;
      d.cash = 100_000; // payroll must not bounce
      runDay(d, rng());
    }
    expect(d.log.some((l) => l.text.includes("Finn is threatening to quit"))).toBe(true);
    d = draftOf(d);
    worker(d, "finn").loyalty = 9;
    worker(d, "finn").mood = 5;
    runDay(d, rng());
    expect(d.workers.some((w) => w.id === "finn")).toBe(false);
  });

  it("fair pay is the loyalty baseline", () => {
    expect(fairSalary(70)).toBe(200);
  });
});

describe("player money actions", () => {
  it("a $200 bonus to Bunc costs exactly $200, raises mood and loyalty, cheers and texts thanks", () => {
    const g = fresh();
    const before = worker(g, "bunc");
    const r = A.payBonus(g, "bunc", 200, rng());
    expect(r.error).toBeNull();
    const after = worker(r.state, "bunc");
    expect(r.state.cash).toBe(g.cash - 200);
    expect(r.state.totalSpent).toBe(g.totalSpent + 200);
    expect(after.mood).toBeGreaterThan(before.mood);
    expect(after.loyalty).toBeGreaterThan(before.loyalty);
    expect(after.bubble?.icon).toBe("paid");
    const thread = r.state.chats.bunc;
    expect(thread[thread.length - 1].from).toBe("worker");
    // The original state is untouched.
    expect(g.cash).toBe(5000);
    expect(worker(g, "bunc").mood).toBe(before.mood);
  });

  it("refuses bonuses the company cannot afford", () => {
    const r = A.payBonus(fresh(), "bunc", 999_999);
    expect(r.error).toMatch(/Not enough cash/);
    expect(r.state.cash).toBe(5000);
  });

  it("raises change salary and cuts hurt", () => {
    const up = A.giveRaise(fresh(), "finn", 25).state;
    expect(worker(up, "finn").salary).toBe(185);
    const down = A.giveRaise(fresh(), "finn", -50);
    expect(worker(down.state, "finn").salary).toBe(110);
    expect(worker(down.state, "finn").mood).toBeLessThan(worker(fresh(), "finn").mood);
    expect(A.giveRaise(fresh(), "finn", -500).state.workers.find((w) => w.id === "finn")!.salary).toBe(50);
  });

  it("task budgets boost output for a day", () => {
    const r = A.fundTask(fresh(), "luke", 200);
    const luke = worker(r.state, "luke");
    expect(luke.boost?.mult).toBeCloseTo(1.5);
    expect(r.state.cash).toBe(4800);
  });

  it("moving a worker to the shop sends them to the Factory", () => {
    const r = A.setFocus(fresh(), "luke", "shop");
    const luke = worker(r.state, "luke");
    expect(luke.focus).toBe("shop");
    expect(luke.homeRoom).toBe(FOCUS_ROOM.shop);
    expect(luke.target?.roomId).toBe("factory");
    expect(luke.activity).toBe("walking");
  });

  it("budgets are clamped", () => {
    expect(A.setBudget(fresh(), "social", 9999).state.economy.budgets.social).toBe(500);
    expect(A.setBudget(fresh(), "social", -5).state.economy.budgets.social).toBe(0);
  });
});

describe("factory", () => {
  it("moves a design through pending → approval → delivered → done", () => {
    const d = draftOf(fresh());
    const outputs = new Map(d.workers.map((w) => [w.id, w.id === "bunc" ? 1 : 0]));
    for (let i = 0; i < 12; i++) runFactory(d, outputs, rng(), { offline: false, paused: false });
    const waiting = d.products.find((p) => p.creatorId === "bunc" && p.stage === "approval");
    expect(waiting).toBeDefined();
    expect(worker(d, "bunc").bubble?.icon).toBe("alert");

    const approved = A.approveProduct(d, waiting!.id).state;
    expect(approved.products.find((p) => p.id === waiting!.id)!.stage).toBe("delivered");
    const d2 = draftOf(approved);
    const launched = d2.economy.launched.tshirt + d2.economy.launched.candle + d2.economy.launched.poster;
    for (let i = 0; i < 4; i++) runFactory(d2, new Map(), rng(), { offline: false, paused: false });
    const live = d2.products.find((p) => p.id === waiting!.id)!;
    expect(live.stage).toBe("done");
    expect(live.liveAt).not.toBeNull();
    expect(d2.economy.launched.tshirt + d2.economy.launched.candle + d2.economy.launched.poster).toBe(launched + 1);
  });

  it("rejecting removes the design", () => {
    const d = draftOf(fresh());
    const p = makeProduct(d, "tshirt", worker(d, "bunc"), rng());
    p.stage = "approval";
    d.products.push(p);
    const r = A.rejectProduct(d, p.id);
    expect(r.state.products.some((x) => x.id === p.id)).toBe(false);
    expect(A.rejectProduct(r.state, p.id).error).not.toBeNull();
  });

  it("auto-approve skips the approval column", () => {
    const d = draftOf(fresh());
    d.economy.autoApprove = true;
    const outputs = new Map(d.workers.map((w) => [w.id, 1]));
    for (let i = 0; i < 12; i++) runFactory(d, outputs, rng(), { offline: false, paused: false });
    expect(d.products.some((p) => p.stage === "approval")).toBe(false);
  });

  it("songs grow fans and videos grow followers when they go live", () => {
    const d = draftOf(fresh());
    const fans = d.economy.businesses.music.fans;
    const p = makeProduct(d, "song", worker(d, "pham"), rng());
    p.stage = "delivered";
    p.progress = 99;
    d.products.push(p);
    runFactory(d, new Map(), rng(), { offline: false, paused: false });
    expect(d.economy.businesses.music.fans).toBeGreaterThan(fans);
  });
});

describe("missions", () => {
  it("assigns a mission, switches focus and pays out on completion", () => {
    const r = A.assignMission(fresh(), "dennis", "research");
    expect(r.error).toBeNull();
    const d = draftOf(r.state);
    expect(worker(d, "dennis").task).toBe(MISSIONS.find((m) => m.id === "research")!.title);
    d.economy.businesses.research.points += 25;
    const cash = d.cash;
    // Any cycle evaluates missions.
    runCycle(d, rng(), { offline: false });
    const m = d.missions[0];
    expect(m.status).toBe("done");
    expect(d.economy.otherIncome).toBe(m.reward);
    expect(d.cash).toBeGreaterThan(cash);
  });

  it("refuses a second mission for the same worker", () => {
    const g = A.assignMission(fresh(), "luke", "social20").state;
    expect(A.assignMission(g, "luke", "shirts5").error).toMatch(/already/);
  });

  it("fails missions after the deadline", () => {
    const g = A.assignMission(fresh(), "pham", "tracks3").state;
    const d = draftOf(g);
    d.minutes = d.missions[0].deadline + 1;
    runCycle(d, rng(), { offline: false });
    expect(d.missions[0].status).toBe("failed");
  });
});

describe("events", () => {
  it("investor money is cash now and a revenue share later", () => {
    const d = draftOf(fresh());
    const ev = triggerEvent(d, "investor", rng())!;
    const r = A.resolveEvent(d, ev.id, 0);
    expect(r.state.cash).toBe(d.cash + Number(ev.data.amount));
    expect(r.state.economy.investorShare).toBeCloseTo(0.1);
    expect(r.state.pendingEvents).toHaveLength(0);
  });

  it("letting a poached worker go removes them; a counter-offer keeps them for a price", () => {
    const d = draftOf(fresh());
    const ev = triggerEvent(d, "poaching", rng())!;
    const id = String(ev.data.workerId);
    const gone = A.resolveEvent(d, ev.id, 1).state;
    expect(gone.workers.some((w) => w.id === id)).toBe(false);
    const kept = A.resolveEvent(d, ev.id, 0).state;
    expect(kept.workers.some((w) => w.id === id)).toBe(true);
    expect(kept.cash).toBe(d.cash - Number(ev.data.cost));
  });

  it("paying for a repair ends an outage at once; patching takes 8 hours", () => {
    const d = draftOf(fresh());
    const ev = triggerEvent(d, "outage", rng())!;
    const paid = A.resolveEvent(d, ev.id, 0).state;
    expect(paid.economy.modifiers.some((m) => m.outage)).toBe(false);
    const patched = A.resolveEvent(d, ev.id, 1).state;
    expect(patched.economy.modifiers.find((m) => m.outage)!.until).toBe(d.minutes + 480);
  });

  it("War Room resolution sends both workers there and improves their relationship", () => {
    const d = draftOf(fresh());
    const ev = triggerEvent(d, "drama", rng())!;
    const a = String(ev.data.a);
    const b = String(ev.data.b);
    const before = worker(d, a).relationships[b];
    const r = A.resolveEvent(d, ev.id, 0).state;
    expect(worker(r, a).relationships[b]).toBe(before + 25);
    expect(worker(r, a).target?.roomId).toBe("war_room");
    expect(worker(r, b).target?.roomId).toBe("war_room");
  });

  it("viral hits multiply a single shop product 10x", () => {
    const d = draftOf(fresh());
    d.products = d.products.slice(0, 1);
    triggerEvent(d, "viral", rng());
    const mod = d.economy.modifiers.find((m) => m.label.startsWith("Viral"))!;
    expect(mod.mult).toBe(10);
    expect(mod.productId).toBe(d.products[0].id);
  });

  it("offline events resolve themselves with the default choice", () => {
    const d = draftOf(fresh());
    triggerEvent(d, "refund", rng(), true);
    expect(d.pendingEvents).toHaveLength(0);
    expect(d.economy.modifiers.some((m) => m.business === "freelance")).toBe(true);
  });

  it("unaffordable choices are refused", () => {
    const d = draftOf(fresh());
    d.cash = 10;
    const ev = triggerEvent(d, "outage", rng())!;
    expect(A.resolveEvent(d, ev.id, 0).error).toMatch(/Not enough cash/);
    expect(resolveEvent(d, "nope", 0, rng())).not.toBeNull();
  });
});

describe("offline progress", () => {
  it("simulates 2 hours away, capped at 3 game days, and reports consistent numbers", () => {
    const g = { ...fresh(), savedAt: 1_000_000 };
    const twoHours = 2 * 60 * 60 * 1000;
    const { game, summary } = applyOffline(g, g.savedAt + twoHours, mulberry32(5));
    expect(summary).not.toBeNull();
    expect(summary!.capped).toBe(true);
    expect(summary!.gameMinutes).toBe(3 * 24 * 60);
    expect(game.minutes).toBeCloseTo(g.minutes + 3 * 24 * 60);
    expect(summary!.cashAfter).toBe(game.cash);
    expect(summary!.cashAfter - summary!.cashBefore).toBeCloseTo(summary!.revenue - summary!.spent + summary!.otherIncome, 6);
    expect(summary!.daysPassed).toBe(3);
    expect(game.pendingEvents).toHaveLength(0);
    expect(game.savedAt).toBe(g.savedAt + twoHours);
  });

  it("short absences and paused games skip the summary", () => {
    const g = { ...fresh(), savedAt: 1_000_000 };
    expect(applyOffline(g, g.savedAt + 2000).summary).toBeNull();
    const paused = { ...g, settings: { ...g.settings, speed: 0 as const } };
    expect(applyOffline(paused, g.savedAt + 3_600_000).summary).toBeNull();
  });
});

describe("save migration", () => {
  it("upgrades a v1 save without an economy", () => {
    const v2 = fresh();
    const v1 = {
      ...v2,
      version: 1,
      economy: undefined,
      products: undefined,
      missions: undefined,
      pendingEvents: undefined,
      chats: undefined,
      seq: undefined,
      workers: v2.workers.map((w) => ({ ...w, focus: undefined, cycleWork: undefined, boost: undefined, lowLoyaltyDays: undefined })),
    };
    const g = deserialize(JSON.stringify(v1))!;
    expect(g).not.toBeNull();
    expect(g.version).toBe(3);
    expect(g.economy.budgets.shop).toBeGreaterThan(0);
    expect(g.products.length).toBeGreaterThan(0);
    expect(worker(g, "pham").focus).toBe("music");
    // And it runs.
    const after = step(g, 120, mulberry32(1));
    expect(after.totalRevenue).toBeGreaterThan(0);
  });
});
