import { describe, expect, it } from "vitest";
import { addFloor, buildRoom, buyUpgrade, upgradeRoom } from "@/game/build";
import { findRoom, floorBase, roomRect } from "@/game/building";
import { draftOf } from "@/game/draft";
import { runCycle, runDay, workerOutput } from "@/game/economy";
import { resolveEvent, triggerEvent } from "@/game/events";
import { ensureCandidates, fire, hire, MAX_CREW, rerollCandidates } from "@/game/hiring";
import { deserialize } from "@/game/save";
import { mulberry32, newGameState, step } from "@/game/sim";
import type { GameState } from "@/game/types";
import { ADD_FLOOR_COST, BUILD_COST, effects, MAX_FLOORS, roomUpgradeCost, SHOP_UPGRADES } from "@/game/upgrades";

const rng = () => mulberry32(5);
const fresh = (cash = 50_000): GameState => ({ ...newGameState("Test Co", "cyan", mulberry32(1)), cash });
const worker = (g: GameState, id: string) => g.workers.find((w) => w.id === id)!;

describe("building rooms", () => {
  it("builds a locked room for its cost", () => {
    const g = fresh();
    const r = buildRoom(g, "marketing_lab");
    expect(r.error).toBeNull();
    const lab = findRoom(r.state.building, "marketing_lab")!;
    expect(lab.locked).toBe(false);
    expect(lab.level).toBe(1);
    expect(r.state.cash).toBe(g.cash - BUILD_COST.MARKETING_LAB!);
    expect(r.state.economy.today.costs.upgrades).toBe(BUILD_COST.MARKETING_LAB);
    expect(buildRoom(r.state, "marketing_lab").error).toMatch(/already/);
  });

  it("refuses without enough cash", () => {
    const r = buildRoom(fresh(100), "recording_studio");
    expect(r.error).toMatch(/costs/);
    expect(r.state.cash).toBe(100);
  });

  it("upgrades rooms to level 5 with rising costs", () => {
    let g = fresh(1e6);
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = g.cash;
      const r = upgradeRoom(g, "factory");
      expect(r.error).toBeNull();
      costs.push(before - r.state.cash);
      g = r.state;
    }
    expect(findRoom(g.building, "factory")!.level).toBe(5);
    expect(costs).toEqual([1, 2, 3, 4].map(roomUpgradeCost));
    expect(costs[3]).toBeGreaterThan(costs[0]);
    expect(upgradeRoom(g, "factory").error).toMatch(/max/);
    expect(upgradeRoom(g, "marketing_lab").error).toMatch(/Build/);
  });
});

describe("adding a floor", () => {
  it("adds a top floor with three locked rooms and shifts everything down", () => {
    const g = fresh();
    const before = g.workers.map((w) => ({ id: w.id, floor: w.floor }));
    const factoryBefore = findRoom(g.building, "factory")!.floor;
    const r = addFloor(g);
    expect(r.error).toBeNull();
    const s = r.state;
    expect(s.building.floors).toBe(4);
    expect(s.cash).toBe(g.cash - ADD_FLOOR_COST);
    const top = s.building.rooms.filter((x) => x.floor === 0);
    expect(top.map((x) => x.type).sort()).toEqual(["ROOFTOP_LOUNGE", "TRADING_DESK", "VAULT"]);
    expect(top.every((x) => x.locked)).toBe(true);
    expect(findRoom(s.building, "factory")!.floor).toBe(factoryBefore + 1);
    for (const b of before) expect(worker(s, b.id).floor).toBe(b.floor + 1);
    expect(addFloor(s).error).toMatch(String(MAX_FLOORS));
  });

  it("keeps workers moving correctly after the floor change", () => {
    let g = addFloor(fresh()).state;
    g = buildRoom(g, "rooftop_lounge").state;
    for (let i = 0; i < 6 * 60; i++) g = step(g, 1, mulberry32(i));
    for (const w of g.workers) {
      expect(w.floor).toBeGreaterThanOrEqual(0);
      expect(w.floor).toBeLessThan(4);
      expect(Number.isFinite(w.x)).toBe(true);
    }
    // Rooms do not overlap after the shift.
    const rects = g.building.rooms.map(roomRect);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    expect(floorBase(3)).toBeGreaterThan(floorBase(0));
  });
});

describe("shop upgrades and room effects", () => {
  it("buys upgrades in levels up to 3", () => {
    let g = fresh(1e6);
    for (let i = 0; i < 3; i++) g = buyUpgrade(g, "coffee").state;
    expect(g.upgrades.coffee).toBe(3);
    expect(buyUpgrade(g, "coffee").error).toMatch(/maxed/);
    const spent = SHOP_UPGRADES.coffee.costs.reduce((a, b) => a + b, 0);
    expect(g.cash).toBe(1e6 - spent);
  });

  it("coffee slows energy drain", () => {
    const base = fresh();
    const caffeinated = buyUpgrade(buyUpgrade(fresh(), "coffee").state, "coffee").state;
    const drained = (g: GameState) => {
      const s = step(g, 60, mulberry32(9));
      return g.workers.reduce((a, w) => a + w.energy, 0) - s.workers.reduce((a, w) => a + w.energy, 0);
    };
    expect(drained(caffeinated)).toBeLessThan(drained(base));
  });

  it("better PCs and room levels raise output", () => {
    const g = fresh();
    const bunc = { ...worker(g, "bunc"), cycleWork: 60 };
    const base = workerOutput(bunc, 0) * effects(g).output(bunc);
    const pcs = buyUpgrade(g, "pcs").state;
    expect(workerOutput(bunc, 0) * effects(pcs).output(bunc)).toBeCloseTo(base * 1.06);
    const factory3 = upgradeRoom(upgradeRoom(g, "factory").state, "factory").state;
    expect(workerOutput(bunc, 0) * effects(factory3).output(bunc)).toBeCloseTo(base * 1.16);
  });

  it("the Recording Studio boosts music income", () => {
    const run = (g: GameState) => {
      const d = draftOf(g);
      // Only Pham works, so Maverick's random experiments can't land in Music.
      for (const w of d.workers) w.cycleWork = w.id === "pham" ? 60 : 0;
      return runCycle(d, mulberry32(3), { offline: false }).revenue.music;
    };
    const plain = run(fresh());
    const studio = run(buildRoom(fresh(), "recording_studio").state);
    expect(studio).toBeCloseTo(plain * 1.25, 1);
  });

  it("the Vault halves event costs", () => {
    const withVault = buildRoom(addFloor(fresh()).state, "vault").state;
    const d = draftOf(withVault);
    const ev = triggerEvent(d, "outage", rng())!;
    const cash = d.cash;
    resolveEvent(d, ev.id, 0, rng());
    expect(cash - d.cash).toBe(200);
  });

  it("the Trading Desk pays interest and the Rooftop Lounge lifts mood daily", () => {
    let g = addFloor(fresh(20_000)).state;
    g = buildRoom(buildRoom(g, "trading_desk").state, "rooftop_lounge").state;
    const d = draftOf(g);
    const other = d.economy.otherIncome;
    d.workers.forEach((w) => (w.mood = 50));
    const moodBefore = d.workers.map((w) => w.mood);
    runDay(d, rng());
    // Interest is paid on what is left after midnight payroll and rent.
    const afterPayroll = g.cash - g.workers.reduce((a, w) => a + w.salary, 0) - 4 * 150;
    expect(d.economy.otherIncome - other).toBe(Math.round(Math.min(400, afterPayroll * 0.004)));
    expect(d.log.some((l) => l.text.includes("Trading Desk"))).toBe(true);
    expect(d.workers[0].mood).toBeGreaterThan(moodBefore[0]);
  });
});

describe("hiring and firing", () => {
  it("generates 3 candidates once per day", () => {
    const g = ensureCandidates(fresh(), rng());
    expect(g.candidates).toHaveLength(3);
    for (const c of g.candidates) {
      expect(c.salary).toBeGreaterThan(0);
      expect(c.skill).toBeGreaterThanOrEqual(45);
      expect(c.bio.length).toBeGreaterThan(5);
    }
    expect(ensureCandidates(g, rng())).toBe(g);
    const tomorrow = { ...g, minutes: g.minutes + 24 * 60 };
    expect(ensureCandidates(tomorrow, rng()).candidates).not.toBe(g.candidates);
  });

  it("rerolling costs a recruiter fee", () => {
    const g = ensureCandidates(fresh(), rng());
    const r = rerollCandidates(g, mulberry32(99));
    expect(r.state.cash).toBe(g.cash - 100);
    expect(r.state.candidates[0].id).not.toBe(g.candidates[0].id);
  });

  it("hiring adds a worker who walks to their desk and costs a signing bonus", () => {
    const g = ensureCandidates(fresh(), rng());
    const c = g.candidates[0];
    const r = hire(g, c.id, rng());
    expect(r.error).toBeNull();
    const s = r.state;
    expect(s.workers).toHaveLength(8);
    const w = s.workers[7];
    expect(w.name).toBe(c.name);
    expect(w.activity).toBe("walking");
    expect(s.cash).toBe(g.cash - c.salary);
    expect(s.candidates.some((x) => x.id === c.id)).toBe(false);
    expect(s.workers.every((o) => o.id === w.id || w.id in o.relationships)).toBe(true);
    expect(s.chats[w.id]?.length).toBe(1);
    // The new hire works and earns.
    let t = s;
    for (let i = 0; i < 4 * 60; i++) t = step(t, 1, mulberry32(i));
    expect(worker(t, w.id).earned).toBeGreaterThan(0);
  });

  it("caps the crew size", () => {
    let g = fresh(1e6);
    for (let i = 0; g.workers.length < MAX_CREW && i < 20; i++) {
      g = ensureCandidates({ ...g, candidatesDay: -1 }, mulberry32(i));
      g = hire(g, g.candidates[0].id, mulberry32(i)).state;
    }
    expect(g.workers).toHaveLength(MAX_CREW);
    g = ensureCandidates({ ...g, candidatesDay: -1 }, rng());
    expect(hire(g, g.candidates[0].id, rng()).error).toMatch(/fits/);
  });

  it("firing removes the worker, pays severance and upsets the crew", () => {
    const g = fresh();
    const luke = worker(g, "luke");
    const r = fire(g, "luke", rng());
    expect(r.error).toBeNull();
    expect(r.state.workers.some((w) => w.id === "luke")).toBe(false);
    expect(r.state.cash).toBe(g.cash - luke.salary);
    // Bunc (+40) and Finn (+25) were Luke's friends: bigger mood hit, and one of them texts about it.
    const bunc = worker(r.state, "bunc");
    expect(bunc.mood).toBeLessThan(worker(g, "bunc").mood - 5);
    expect(r.state.workers.every((w) => w.loyalty <= worker(g, w.id).loyalty)).toBe(true);
    const reaction = ["bunc", "finn"].map((id) => r.state.chats[id]?.at(-1)?.text ?? "").find((t) => /Luke/.test(t));
    expect(reaction).toBeDefined();
  });

  it("survives a save round-trip with hires and upgrades", () => {
    let g = ensureCandidates(fresh(), rng());
    g = hire(g, g.candidates[0].id, rng()).state;
    g = buyUpgrade(addFloor(g).state, "neon_sign").state;
    const back = deserialize(JSON.stringify(g))!;
    expect(back.workers).toHaveLength(8);
    expect(back.building.floors).toBe(4);
    expect(back.upgrades.neon_sign).toBe(1);
  });
});
