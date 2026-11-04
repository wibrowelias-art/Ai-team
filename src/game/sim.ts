import { FOCUS_ROOM } from "./business";
import { findRoom, initialBuilding, ROOM_DEFS, roomByType, spotX } from "./building";
import { CYCLES_PER_DAY, SAVE_VERSION, START_CASH, START_MINUTE, type ThemeId } from "./constants";
import { createWorker, CREW_SEEDS } from "./crew";
import { bubble, clamp, log, ownEconomy } from "./draft";
import { newEconomy, runCycle, runDay } from "./economy";
import { moveWorker, pickSpot, REST_KINDS, sendWorker, WORK_KINDS, type Rng } from "./movement";
import { starterProducts } from "./products";
import { cycleIndex, dayOf } from "./time";
import type { GameState, Worker } from "./types";

export { isRiding, moveWorker, pickSpot, REST_KINDS, sendWorker, WORK_KINDS } from "./movement";
export type { Rng } from "./movement";

/** Small deterministic PRNG for tests and reproducible runs. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGameState(name: string, theme: ThemeId, rng: Rng = Math.random): GameState {
  const building = initialBuilding();
  const workers: Worker[] = [];
  for (const seed of CREW_SEEDS) {
    const room = findRoom(building, FOCUS_ROOM[seed.focus]) ?? building.rooms[0];
    const w = createWorker(seed, room.floor, 0, rng);
    const spot = pickSpot(room, WORK_KINDS, workers, rng) ?? 0;
    w.x = spotX(room, spot);
    w.target = { roomId: room.id, spot, purpose: "working" };
    w.activity = "working";
    w.facing = ROOM_DEFS[room.type].spots[spot].face;
    w.timer = 20 + rng() * 60;
    workers.push(w);
  }
  const company = name.trim() || "NEON HQ";
  const s: GameState = {
    version: SAVE_VERSION,
    started: true,
    company: { name: company, theme },
    cash: START_CASH,
    totalRevenue: 0,
    totalSpent: 0,
    minutes: START_MINUTE,
    cyclesToday: 0,
    building,
    workers,
    log: [{ t: START_MINUTE, text: `${company} opens its doors. Welcome, boss.`, kind: "system" }],
    settings: { speed: 1, sound: true, scanlines: true, ai: true },
    savedAt: Date.now(),
    economy: newEconomy(dayOf(START_MINUTE)),
    products: [],
    missions: [],
    pendingEvents: [],
    chats: {},
    seq: 0,
  };
  const bunc = workers.find((w) => w.id === "bunc") ?? workers[0];
  s.products = starterProducts(s, bunc, rng);
  s.economy.launched.tshirt = s.products.length;
  return s;
}

// ---------------------------------------------------------------- worker brains

function decide(w: Worker, s: GameState, rng: Rng): void {
  const b = s.building;
  const now = s.minutes;
  const home = findRoom(b, w.homeRoom);
  const chill = roomByType(b, "CHILL");

  if (w.energy < 25 && w.activity !== "resting" && chill) {
    const spot = pickSpot(chill, REST_KINDS, s.workers, rng, w.id);
    if (spot !== null) {
      sendWorker(w, chill, spot, "resting");
      bubble(w, "tired", now, 10);
      log(s, `${w.name} is wiped out and heads to the Chill Bar.`, "info");
      return;
    }
  }

  if (w.activity === "resting") {
    if (w.energy >= 92 && home) {
      const spot = pickSpot(home, WORK_KINDS, s.workers, rng, w.id) ?? 0;
      sendWorker(w, home, spot, "working");
    } else {
      w.timer = 10;
    }
    return;
  }

  if (w.activity === "working" && rng() < 0.3) {
    const others = b.rooms.filter((r) => !r.locked && r.id !== w.homeRoom);
    const room = others[Math.floor(rng() * others.length)];
    if (room) {
      const spots = ROOM_DEFS[room.type].spots;
      const spot = pickSpot(room, ["stand", ...REST_KINDS, "chair"], s.workers, rng, w.id) ?? Math.floor(rng() * spots.length);
      sendWorker(w, room, spot, "visiting");
      return;
    }
  }

  if (home && w.target?.roomId !== home.id) {
    const spot = pickSpot(home, WORK_KINDS, s.workers, rng, w.id) ?? 0;
    sendWorker(w, home, spot, "working");
    return;
  }

  w.activity = "working";
  w.timer = 40 + rng() * 80;
  if (rng() < 0.25 && !w.bubble) bubble(w, "idea", now, 6);
}

function arrive(w: Worker, s: GameState, rng: Rng): void {
  const t = w.target;
  w.activity = t?.purpose ?? "idle";
  if (t) {
    const room = findRoom(s.building, t.roomId);
    if (room) w.facing = ROOM_DEFS[room.type].spots[t.spot]?.face ?? w.facing;
  }
  w.timer = w.activity === "visiting" ? 15 + rng() * 25 : w.activity === "resting" ? 10 : 40 + rng() * 80;
}

function updateStats(w: Worker, dt: number): void {
  switch (w.activity) {
    case "working":
      w.energy = clamp(w.energy - 0.11 * dt);
      w.cycleWork += dt;
      break;
    case "resting":
      w.energy = clamp(w.energy + 0.7 * dt);
      w.mood = clamp(w.mood + 0.04 * dt);
      break;
    case "walking":
    case "visiting":
      w.energy = clamp(w.energy - 0.05 * dt);
      w.mood = clamp(w.mood + 0.01 * dt);
      break;
    default:
      break;
  }
  if (w.energy < 15) w.mood = clamp(w.mood - 0.03 * dt);
}

function stepWorkers(s: GameState, dt: number, rng: Rng): void {
  for (const w of s.workers) {
    if (w.bubble && w.bubble.until <= s.minutes) w.bubble = null;
    updateStats(w, dt);
    if (w.activity === "walking") {
      if (moveWorker(w, dt)) arrive(w, s, rng);
      continue;
    }
    w.timer -= dt;
    if (w.timer <= 0 || (w.energy < 25 && w.activity !== "resting")) decide(w, s, rng);
  }
}

// ---------------------------------------------------------------- step

export interface StepOptions {
  /** offline catch-up: events resolve themselves and products auto-approve */
  offline?: boolean;
}

/** Advance the world by dtMin game minutes. Returns a new state object; the input is not mutated. */
export function step(state: GameState, dtMin: number, rng: Rng = Math.random, opts: StepOptions = {}): GameState {
  if (dtMin <= 0) return state;
  const s: GameState = { ...state, workers: state.workers.map((w) => ({ ...w })) };
  let owned = false;
  let remaining = dtMin;
  while (remaining > 0) {
    const dt = Math.min(1, remaining);
    remaining -= dt;
    const before = s.minutes;
    s.minutes += dt;
    stepWorkers(s, dt, rng);
    const crossed = cycleIndex(s.minutes) - cycleIndex(before);
    for (let i = 1; i <= crossed; i++) {
      if (!owned) {
        ownEconomy(s);
        s.workers = s.workers.map((w) => ({ ...w, relationships: { ...w.relationships } }));
        owned = true;
      }
      const c = cycleIndex(before) + i;
      runCycle(s, rng, { offline: !!opts.offline });
      if (c % CYCLES_PER_DAY === 0) {
        runDay(s, rng);
        s.cyclesToday = 0;
        log(s, `Day ${dayOf(s.minutes)} begins.`, "system");
      } else {
        s.cyclesToday += 1;
      }
    }
  }
  return s;
}
