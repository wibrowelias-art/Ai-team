import { floorBase } from "@/game/building";
import type { Worker } from "@/game/types";

/** Feet position of a worker in world coordinates. */
export function workerFeet(w: Worker): { x: number; y: number } {
  return { x: w.x, y: floorBase(w.floor) + w.y };
}

/** Find the worker under a world point. Generous box for fat fingers; nearest wins. */
export function workerAt(workers: Worker[], wx: number, wy: number, pad = 3): Worker | undefined {
  let best: Worker | undefined;
  let bestD = Infinity;
  for (const w of workers) {
    const f = workerFeet(w);
    if (wx >= f.x - 6 - pad && wx <= f.x + 6 + pad && wy >= f.y - 17 - pad && wy <= f.y + pad) {
      const d = Math.hypot(wx - f.x, wy - (f.y - 8));
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
  }
  return best;
}
