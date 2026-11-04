import { findRoom, floorBase, initialBuilding, ROOM_DEFS, roomByType, spotX } from "./building";
import {
  CYCLES_PER_DAY,
  ELEVATOR_SPEED,
  SAVE_VERSION,
  START_CASH,
  START_MINUTE,
  WALK_SPEED,
  type ThemeId,
} from "./constants";
import { createWorker, CREW_SEEDS } from "./crew";
import { planRoute } from "./pathfinding";
import { cycleIndex, dayOf } from "./time";
import type { Activity, BubbleIcon, GameState, LogEntry, RoomSlot, SpotKind, Worker } from "./types";

export type Rng = () => number;

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

export const WORK_KINDS: SpotKind[] = ["desk", "bench", "rack", "chair"];
export const REST_KINDS: SpotKind[] = ["couch", "pool", "arcade", "bar"];

const LOG_CAP = 120;

export function newGameState(name: string, theme: ThemeId, rng: Rng = Math.random): GameState {
  const building = initialBuilding();
  const workers: Worker[] = [];
  for (const seed of CREW_SEEDS) {
    const room = findRoom(building, seed.homeRoom) ?? building.rooms[0];
    const w = createWorker(seed, room.floor, 0, rng);
    const spot = pickSpot(room, WORK_KINDS, workers, rng) ?? 0;
    w.x = spotX(room, spot);
    w.target = { roomId: room.id, spot, purpose: "working" };
    w.activity = "working";
    w.facing = ROOM_DEFS[room.type].spots[spot].face;
    w.timer = 20 + rng() * 60;
    workers.push(w);
  }
  return {
    version: SAVE_VERSION,
    started: true,
    company: { name: name.trim() || "NEON HQ", theme },
    cash: START_CASH,
    totalRevenue: 0,
    totalSpent: 0,
    minutes: START_MINUTE,
    cyclesToday: 0,
    building,
    workers,
    log: [{ t: START_MINUTE, text: `${name.trim() || "NEON HQ"} opens its doors. Welcome, boss.`, kind: "system" }],
    settings: { speed: 1, sound: true, scanlines: true, ai: true },
    savedAt: Date.now(),
  };
}

function occupied(workers: Worker[], exceptId?: string): Set<string> {
  const s = new Set<string>();
  for (const w of workers) {
    if (w.id !== exceptId && w.target) s.add(`${w.target.roomId}:${w.target.spot}`);
  }
  return s;
}

/** Pick a free spot of the given kinds in a room. Returns null when the room has no such spot at all. */
export function pickSpot(room: RoomSlot, kinds: SpotKind[], workers: Worker[], rng: Rng, exceptId?: string): number | null {
  const spots = ROOM_DEFS[room.type].spots;
  const taken = occupied(workers, exceptId);
  const matching = spots.map((s, i) => ({ s, i })).filter(({ s }) => kinds.includes(s.kind));
  if (matching.length === 0) return null;
  const free = matching.filter(({ i }) => !taken.has(`${room.id}:${i}`));
  const pool = free.length > 0 ? free : matching;
  return pool[Math.floor(rng() * pool.length)].i;
}

/** Send a worker somewhere. Plans the route and marks them as walking. */
export function sendWorker(w: Worker, room: RoomSlot, spot: number, purpose: Activity): void {
  const tx = spotX(room, spot);
  w.route = planRoute({ floor: w.floor, x: w.x }, { floor: room.floor, x: tx });
  w.target = { roomId: room.id, spot, purpose };
  w.activity = "walking";
  w.y = 0;
}

function setBubble(w: Worker, icon: BubbleIcon, now: number, duration = 8): void {
  w.bubble = { icon, until: now + duration };
}

function speedFactor(w: Worker): number {
  return 0.8 + w.speed / 250;
}

/** Move a worker along their route. Returns true when the route finished during this step. */
export function moveWorker(w: Worker, dtMin: number): boolean {
  if (w.route.length === 0) return false;
  let walkBudget = WALK_SPEED * speedFactor(w) * dtMin;
  let rideBudget = ELEVATOR_SPEED * dtMin;
  while (w.route.length > 0) {
    const step = w.route[0];
    if (step.kind === "walk") {
      const dx = step.x - w.x;
      if (dx !== 0) w.facing = dx > 0 ? 1 : -1;
      if (Math.abs(dx) <= walkBudget) {
        walkBudget -= Math.abs(dx);
        w.x = step.x;
        w.route = w.route.slice(1);
      } else {
        w.x += Math.sign(dx) * walkBudget;
        return false;
      }
    } else {
      const targetOffset = floorBase(step.toFloor) - floorBase(w.floor);
      const dy = targetOffset - w.y;
      if (Math.abs(dy) <= rideBudget) {
        rideBudget -= Math.abs(dy);
        w.floor = step.toFloor;
        w.y = 0;
        w.route = w.route.slice(1);
      } else {
        w.y += Math.sign(dy) * rideBudget;
        return false;
      }
    }
  }
  return true;
}

export function isRiding(w: Worker): boolean {
  return w.route.length > 0 && w.route[0].kind === "ride" && w.y !== 0;
}

function pushLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...log, entry];
  return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

interface StepCtx {
  state: GameState;
  workers: Worker[];
  log: LogEntry[];
  rng: Rng;
  now: number;
}

function decide(w: Worker, ctx: StepCtx): void {
  const { state, workers, rng, now } = ctx;
  const b = state.building;
  const home = findRoom(b, w.homeRoom);
  const chill = roomByType(b, "CHILL");

  if (w.energy < 25 && w.activity !== "resting" && chill) {
    const spot = pickSpot(chill, REST_KINDS, workers, rng, w.id);
    if (spot !== null) {
      sendWorker(w, chill, spot, "resting");
      setBubble(w, "tired", now, 10);
      ctx.log = pushLog(ctx.log, { t: now, text: `${w.name} is wiped out and heads to the Chill Bar.`, kind: "info" });
      return;
    }
  }

  if (w.activity === "resting") {
    if (w.energy >= 92 && home) {
      const spot = pickSpot(home, WORK_KINDS, workers, rng, w.id) ?? 0;
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
      const spot = pickSpot(room, ["stand", ...REST_KINDS, "chair"], workers, rng, w.id) ?? Math.floor(rng() * spots.length);
      sendWorker(w, room, spot, "visiting");
      return;
    }
  }

  if (home && w.target?.roomId !== home.id) {
    const spot = pickSpot(home, WORK_KINDS, workers, rng, w.id) ?? 0;
    sendWorker(w, home, spot, "working");
    return;
  }

  w.activity = "working";
  w.timer = 40 + rng() * 80;
  if (rng() < 0.25) setBubble(w, "idea", now, 6);
}

function arrive(w: Worker, ctx: StepCtx): void {
  const t = w.target;
  w.activity = t?.purpose ?? "idle";
  if (t) {
    const room = findRoom(ctx.state.building, t.roomId);
    if (room) {
      w.facing = ROOM_DEFS[room.type].spots[t.spot]?.face ?? w.facing;
    }
  }
  w.timer = w.activity === "visiting" ? 15 + ctx.rng() * 25 : w.activity === "resting" ? 10 : 40 + ctx.rng() * 80;
}

function updateStats(w: Worker, dt: number): void {
  switch (w.activity) {
    case "working":
      w.energy = clamp(w.energy - 0.11 * dt);
      w.taskProgress = (w.taskProgress + dt * (0.04 + w.skill / 4000) * (0.5 + w.mood / 200)) % 100;
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

function stepWorkers(ctx: StepCtx, dt: number): void {
  for (const w of ctx.workers) {
    if (w.bubble && w.bubble.until <= ctx.now) w.bubble = null;
    updateStats(w, dt);
    if (w.activity === "walking") {
      if (moveWorker(w, dt)) arrive(w, ctx);
      continue;
    }
    w.timer -= dt;
    if (w.timer <= 0 || (w.energy < 25 && w.activity !== "resting")) decide(w, ctx);
  }
}

/** Advance the world by dtMin game minutes. Returns a new state object. */
export function step(state: GameState, dtMin: number, rng: Rng = Math.random): GameState {
  if (dtMin <= 0) return state;
  const ctx: StepCtx = {
    state,
    workers: state.workers.map((w) => ({ ...w })),
    log: state.log,
    rng,
    now: state.minutes,
  };
  let cyclesToday = state.cyclesToday;
  let remaining = dtMin;
  while (remaining > 0) {
    const dt = Math.min(1, remaining);
    remaining -= dt;
    const before = ctx.now;
    ctx.now += dt;
    stepWorkers(ctx, dt);
    const crossed = cycleIndex(ctx.now) - cycleIndex(before);
    for (let i = 1; i <= crossed; i++) {
      const c = cycleIndex(before) + i;
      if (c % CYCLES_PER_DAY === 0) {
        cyclesToday = 0;
        ctx.log = pushLog(ctx.log, { t: ctx.now, text: `Day ${dayOf(ctx.now)} begins.`, kind: "system" });
      } else {
        cyclesToday += 1;
      }
    }
  }
  return { ...state, minutes: ctx.now, cyclesToday, workers: ctx.workers, log: ctx.log };
}
