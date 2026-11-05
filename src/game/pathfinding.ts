import { SHAFT_CENTER_X } from "./constants";
import type { RouteStep } from "./types";

export interface Place {
  floor: number;
  x: number;
}

/**
 * Plan a route between two places in the building.
 * Same floor: walk. Different floor: walk to the nearest elevator shaft, ride, walk out.
 */
export function planRoute(from: Place, to: Place, shafts: number[] = [SHAFT_CENTER_X]): RouteStep[] {
  if (from.floor === to.floor) {
    return from.x === to.x ? [] : [{ kind: "walk", x: to.x }];
  }
  let best = shafts[0];
  let bestCost = Infinity;
  for (const s of shafts) {
    const cost = Math.abs(from.x - s) + Math.abs(to.x - s);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  const steps: RouteStep[] = [];
  if (from.x !== best) steps.push({ kind: "walk", x: best });
  steps.push({ kind: "ride", toFloor: to.floor });
  if (to.x !== best) steps.push({ kind: "walk", x: to.x });
  return steps;
}

/** Total travel distance of a route in world pixels. */
export function routeLength(from: Place, route: RouteStep[], floorHeight: number): number {
  let { x, floor } = from;
  let total = 0;
  for (const s of route) {
    if (s.kind === "walk") {
      total += Math.abs(s.x - x);
      x = s.x;
    } else {
      total += Math.abs(s.toFloor - floor) * floorHeight;
      floor = s.toFloor;
    }
  }
  return total;
}
