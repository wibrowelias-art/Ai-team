import { floorBase, ROOM_DEFS, spotX } from "./building";
import { ELEVATOR_SPEED, WALK_SPEED } from "./constants";
import { planRoute } from "./pathfinding";
import type { Activity, RoomSlot, SpotKind, Worker } from "./types";

export type Rng = () => number;

export const WORK_KINDS: SpotKind[] = ["desk", "bench", "rack", "chair"];
export const REST_KINDS: SpotKind[] = ["couch", "pool", "arcade", "bar"];

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
  const ride = w.route[0];
  if (ride?.kind === "ride" && w.y !== 0) {
    // Mid-ride: finish the ride, then re-plan from that floor.
    w.route = [ride, ...planRoute({ floor: ride.toFloor, x: w.x }, { floor: room.floor, x: tx })];
  } else {
    w.route = planRoute({ floor: w.floor, x: w.x }, { floor: room.floor, x: tx });
    w.y = 0;
  }
  w.target = { roomId: room.id, spot, purpose };
  w.activity = "walking";
}

function speedFactor(w: Worker): number {
  return 0.8 + w.speed / 250;
}

/** Move a worker along their route. Returns true once the route is finished. */
export function moveWorker(w: Worker, dtMin: number): boolean {
  // An empty route means we are already there.
  if (w.route.length === 0) return true;
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

