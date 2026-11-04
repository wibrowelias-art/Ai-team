/**
 * Helpers for building a new GameState from an old one. Game logic works on a "draft":
 * a copy whose mutable parts are owned by the caller, so the previous state is never mutated.
 */
import { emptyByBusiness } from "./business";
import type { BubbleIcon, BusinessId, CostKind, DayLedger, GameState, LogEntry, Worker } from "./types";

const LOG_CAP = 150;
const CHAT_CAP = 60;

/** Copy every mutable part of the state so it can be changed in place. */
export function draftOf(s: GameState): GameState {
  return {
    ...s,
    workers: s.workers.map((w) => ({ ...w, relationships: { ...w.relationships }, memories: [...w.memories] })),
    economy: structuredClone(s.economy),
    products: s.products.map((p) => ({ ...p })),
    missions: s.missions.map((m) => ({ ...m })),
    pendingEvents: s.pendingEvents.map((e) => ({ ...e })),
    chats: { ...s.chats },
    log: [...s.log],
    settings: { ...s.settings },
  };
}

/** Like draftOf but keeps worker objects (already owned by the caller). */
export function ownEconomy(s: GameState): void {
  s.economy = structuredClone(s.economy);
  s.products = s.products.map((p) => ({ ...p }));
  s.missions = s.missions.map((m) => ({ ...m }));
  s.pendingEvents = s.pendingEvents.map((e) => ({ ...e }));
  s.chats = { ...s.chats };
}

export function nextId(s: GameState, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq}`;
}

export function log(s: GameState, text: string, kind: LogEntry["kind"] = "info"): void {
  const next = [...s.log, { t: s.minutes, text, kind }];
  s.log = next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
}

/** A worker texts the player. */
export function say(s: GameState, workerId: string, text: string): void {
  const thread = s.chats[workerId] ?? [];
  const next = [...thread, { id: nextId(s, "m"), from: "worker" as const, text, t: s.minutes }];
  s.chats = { ...s.chats, [workerId]: next.length > CHAT_CAP ? next.slice(next.length - CHAT_CAP) : next };
}

export function bubble(w: Worker, icon: BubbleIcon, now: number, duration = 8): void {
  w.bubble = { icon, until: now + duration };
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function newLedger(day: number): DayLedger {
  return {
    day,
    revenue: 0,
    spent: 0,
    byBusiness: emptyByBusiness(),
    costs: { salaries: 0, rent: 0, compute: 0, budgets: 0, bonuses: 0, events: 0 },
  };
}

/** Book business revenue. */
export function earn(s: GameState, business: BusinessId, amount: number, worker?: Worker): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  s.cash += amount;
  s.totalRevenue += amount;
  s.economy.today.revenue += amount;
  s.economy.today.byBusiness[business] += amount;
  s.economy.businesses[business].totalRevenue += amount;
  if (worker) worker.earned += amount;
}

/** Book a cost. */
export function spend(s: GameState, kind: CostKind, amount: number, worker?: Worker): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  s.cash -= amount;
  s.totalSpent += amount;
  s.economy.today.spent += amount;
  s.economy.today.costs[kind] += amount;
  if (worker) worker.spent += amount;
}

/** Cash that is neither revenue nor a cost (investor money). */
export function otherIncome(s: GameState, amount: number): void {
  s.cash += amount;
  s.economy.otherIncome += amount;
}
