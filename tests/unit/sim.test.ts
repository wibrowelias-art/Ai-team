import { describe, expect, it } from "vitest";
import { findRoom, floorBase, roomByType, spotX } from "@/game/building";
import { SHAFT_CENTER_X, START_CASH, START_MINUTE } from "@/game/constants";
import { deserialize, isValidSave, serialize } from "@/game/save";
import { moveWorker, mulberry32, newGameState, pickSpot, sendWorker, step, WORK_KINDS } from "@/game/sim";
import type { GameState } from "@/game/types";

function fresh(seed = 1): GameState {
  return newGameState("Test Co", "pink", mulberry32(seed));
}

describe("new game", () => {
  it("starts with $5,000, 7 workers and 3 floors on day 1", () => {
    const g = fresh();
    expect(g.cash).toBe(START_CASH);
    expect(g.workers.map((w) => w.name)).toEqual(["Matt", "Finn", "Dennis", "Pham", "Bunc", "Luke", "Maverick"]);
    expect(g.building.floors).toBe(3);
    expect(g.minutes).toBe(START_MINUTE);
  });

  it("places every worker at a unique work spot in their home room", () => {
    const g = fresh();
    const spots = new Set(g.workers.map((w) => `${w.target?.roomId}:${w.target?.spot}`));
    expect(spots.size).toBe(g.workers.length);
    for (const w of g.workers) {
      const home = findRoom(g.building, w.homeRoom)!;
      expect(w.floor).toBe(home.floor);
      expect(w.x).toBe(spotX(home, w.target!.spot));
    }
  });
});

describe("movement", () => {
  it("walks to the elevator, rides, and arrives on another floor", () => {
    const g = fresh();
    const w = { ...g.workers.find((x) => x.id === "bunc")! };
    const command = findRoom(g.building, "command")!;
    sendWorker(w, command, 3, "visiting");
    expect(w.route[0]).toEqual({ kind: "walk", x: SHAFT_CENTER_X });
    let sawRide = false;
    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      done = moveWorker(w, 0.25);
      if (w.y !== 0) sawRide = true;
    }
    expect(done).toBe(true);
    expect(sawRide).toBe(true);
    expect(w.floor).toBe(command.floor);
    expect(w.x).toBe(spotX(command, 3));
    expect(w.y).toBe(0);
  });

  it("moves at most the walking budget per step", () => {
    const g = fresh();
    const w = { ...g.workers[0], route: [{ kind: "walk" as const, x: g.workers[0].x + 200 }] };
    const x0 = w.x;
    moveWorker(w, 0.1);
    expect(w.x - x0).toBeGreaterThan(0);
    expect(w.x - x0).toBeLessThan(10);
    expect(w.facing).toBe(1);
  });

  it("never reserves the same spot twice while free spots exist", () => {
    const g = fresh();
    const factory = findRoom(g.building, "factory")!;
    const rng = mulberry32(4);
    for (let i = 0; i < 20; i++) {
      const spot = pickSpot(factory, WORK_KINDS, g.workers, rng, "matt");
      const taken = g.workers.filter((w) => w.target?.roomId === "factory").map((w) => w.target!.spot);
      expect(taken).not.toContain(spot);
    }
  });
});

describe("simulation step", () => {
  it("advances the clock and counts cycles", () => {
    const g = step(fresh(), 125, mulberry32(2));
    expect(g.minutes).toBeCloseTo(START_MINUTE + 125);
    expect(g.cyclesToday).toBe(2);
  });

  it("resets the cycle counter at midnight and logs the new day", () => {
    const g = step(fresh(), 24 * 60 - START_MINUTE + 61, mulberry32(3));
    expect(g.cyclesToday).toBe(1);
    expect(g.log.some((l) => l.text.includes("Day 2"))).toBe(true);
  });

  it("does not mutate the previous state", () => {
    const g = fresh();
    const snapshot = JSON.stringify(g);
    step(g, 30, mulberry32(5));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("sends exhausted workers to the Chill Bar and lets them recover", () => {
    let g = fresh(7);
    g = { ...g, workers: g.workers.map((w) => (w.id === "finn" ? { ...w, energy: 10 } : w)) };
    const chill = roomByType(g.building, "CHILL")!;
    g = step(g, 1, mulberry32(8));
    const finn = g.workers.find((w) => w.id === "finn")!;
    expect(finn.target?.roomId).toBe(chill.id);
    expect(finn.bubble?.icon).toBe("tired");
    g = step(g, 90, mulberry32(9));
    const rested = g.workers.find((w) => w.id === "finn")!;
    expect(rested.energy).toBeGreaterThan(50);
  });

  it("keeps everyone moving between rooms over a long run without breaking", () => {
    let g = fresh(11);
    const rng = mulberry32(12);
    const visited = new Set<string>();
    for (let i = 0; i < 24 * 60; i++) {
      g = step(g, 1, rng);
      for (const w of g.workers) {
        expect(Number.isFinite(w.x)).toBe(true);
        expect(w.energy).toBeGreaterThanOrEqual(0);
        expect(w.energy).toBeLessThanOrEqual(100);
        if (w.activity !== "walking") {
          expect(w.y).toBe(0);
          if (w.target) visited.add(w.target.roomId);
        }
      }
    }
    expect(visited.size).toBeGreaterThanOrEqual(5);
    // Workers stand on real floors when not riding.
    for (const w of g.workers) expect(floorBase(w.floor)).toBeGreaterThan(0);
  });
});

describe("save", () => {
  it("round-trips through JSON", () => {
    const g = step(fresh(), 42, mulberry32(1));
    const back = deserialize(serialize(g));
    expect(back).not.toBeNull();
    expect(back!.minutes).toBeCloseTo(g.minutes);
    expect(back!.workers).toHaveLength(7);
  });

  it("rejects garbage and foreign files", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(isValidSave({ ...fresh(), cash: "lots" })).toBe(false);
    expect(isValidSave({ ...fresh(), version: 999 })).toBe(false);
  });

  it("fills in missing settings from older saves", () => {
    const g = fresh();
    const old = { ...g, settings: { speed: 2 } };
    const back = deserialize(JSON.stringify(old))!;
    expect(back.settings).toEqual({ speed: 2, sound: true, scanlines: true, ai: true, graphics: "auto" });
  });
});
