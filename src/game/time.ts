import { MINUTES_PER_CYCLE, MINUTES_PER_DAY } from "./constants";

export function dayOf(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY) + 1;
}

export function clockOf(minutes: number): string {
  const m = Math.floor(minutes) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Game minutes until the next cycle boundary. */
export function minutesToNextCycle(minutes: number): number {
  const into = minutes % MINUTES_PER_CYCLE;
  return MINUTES_PER_CYCLE - into;
}

export function formatDuration(gameMinutes: number): string {
  const total = Math.max(0, Math.ceil(gameMinutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function cycleIndex(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_CYCLE);
}

export function formatMoney(n: number, compact = false): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (compact) {
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  }
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}
