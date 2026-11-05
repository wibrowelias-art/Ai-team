/**
 * Player actions. Each takes a state and returns { state, error }. The input is never mutated.
 * Validation lives here so the UI, the AI action layer (Phase 3) and tests share one path.
 */
import { findRoom } from "./building";
import { BUSINESSES, FOCUS_ROOM } from "./business";
import { MAX_BUDGET } from "./constants";
import { bubble, clamp, draftOf, log, say, spend } from "./draft";
import { resolveEvent as resolveEventDraft } from "./events";
import { line } from "./lines";
import { assignMission as assignMissionDraft } from "./missions";
import { pickSpot, sendWorker, WORK_KINDS, type Rng } from "./movement";
import { approve, reject } from "./products";
import type { BusinessId, Focus, GameState } from "./types";

export interface ActionResult {
  state: GameState;
  error: string | null;
}

const ok = (state: GameState): ActionResult => ({ state, error: null });
const fail = (state: GameState, error: string): ActionResult => ({ state, error });

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** One-time bonus. */
export function payBonus(state: GameState, workerId: string, amount: number, rng: Rng = Math.random): ActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return fail(state, "Bonus must be more than $0.");
  if (amount > state.cash) return fail(state, `Not enough cash for a ${money(amount)} bonus.`);
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return fail(state, "That worker is not on the crew.");
  spend(s, "bonuses", amount, w);
  w.mood = clamp(w.mood + Math.min(25, amount / 10));
  w.loyalty = clamp(w.loyalty + Math.min(15, amount / 25));
  bubble(w, "paid", s.minutes, 5);
  say(s, w.id, line(w.id, amount >= 300 ? "bigBonus" : "bonus", rng));
  log(s, `Paid ${w.name} a ${money(amount)} bonus.`, "good");
  return ok(s);
}

/** Change daily salary. Negative values are pay cuts. */
export function giveRaise(state: GameState, workerId: string, delta: number, rng: Rng = Math.random): ActionResult {
  if (!Number.isFinite(delta) || delta === 0) return fail(state, "Pick a raise amount.");
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return fail(state, "That worker is not on the crew.");
  const next = Math.max(50, Math.round(w.salary + delta));
  if (next === w.salary) return fail(state, "Salary cannot go below $50/day.");
  const applied = next - w.salary;
  w.salary = next;
  if (applied > 0) {
    w.mood = clamp(w.mood + Math.min(15, applied / 3));
    w.loyalty = clamp(w.loyalty + Math.min(20, applied / 2.5));
    bubble(w, "paid", s.minutes, 5);
    say(s, w.id, line(w.id, "raise", rng));
    log(s, `Gave ${w.name} a raise to ${money(next)}/day.`, "good");
  } else {
    w.mood = clamp(w.mood + Math.max(-20, applied / 2));
    w.loyalty = clamp(w.loyalty + Math.max(-25, applied / 2));
    bubble(w, "angry", s.minutes, 8);
    say(s, w.id, line(w.id, "payCut", rng));
    log(s, `Cut ${w.name}'s pay to ${money(next)}/day.`, "bad");
  }
  return ok(s);
}

/** Task budget: cash now for a 24h output boost. */
export function fundTask(state: GameState, workerId: string, amount: number, rng: Rng = Math.random): ActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return fail(state, "Budget must be more than $0.");
  if (amount > state.cash) return fail(state, `Not enough cash for a ${money(amount)} task budget.`);
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return fail(state, "That worker is not on the crew.");
  spend(s, "bonuses", amount, w);
  const mult = 1 + Math.min(0.5, amount / 400);
  w.boost = { mult, until: s.minutes + 24 * 60 };
  w.mood = clamp(w.mood + 3);
  say(s, w.id, line(w.id, "taskBudget", rng));
  log(s, `Gave ${w.name} a ${money(amount)} task budget (+${Math.round((mult - 1) * 100)}% output for 24h).`, "good");
  return ok(s);
}

/** Move a worker to another business. They walk to its room. */
export function setFocus(state: GameState, workerId: string, focus: Focus, rng: Rng = Math.random): ActionResult {
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return fail(state, "That worker is not on the crew.");
  const roomId = FOCUS_ROOM[focus];
  const room = findRoom(s.building, roomId);
  if (!room || room.locked) return fail(state, "That room is not available.");
  w.focus = focus;
  w.homeRoom = roomId;
  if (w.activity !== "resting") {
    const spot = pickSpot(room, WORK_KINDS, s.workers, rng, w.id) ?? 0;
    sendWorker(w, room, spot, "working");
  }
  return ok(s);
}

export function setBudget(state: GameState, business: BusinessId, perDay: number): ActionResult {
  if (!BUSINESSES.includes(business)) return fail(state, "Unknown department.");
  if (!Number.isFinite(perDay)) return fail(state, "Invalid budget.");
  const s = { ...state, economy: { ...state.economy, budgets: { ...state.economy.budgets, [business]: clamp(Math.round(perDay), 0, MAX_BUDGET) } } };
  return ok(s);
}

export function setAutoApprove(state: GameState, on: boolean): ActionResult {
  return ok({ ...state, economy: { ...state.economy, autoApprove: on } });
}

export function approveProduct(state: GameState, productId: string, rng: Rng = Math.random): ActionResult {
  const s = draftOf(state);
  return approve(s, productId, rng) ? ok(s) : fail(state, "That product is not waiting for approval.");
}

export function rejectProduct(state: GameState, productId: string, rng: Rng = Math.random): ActionResult {
  const s = draftOf(state);
  return reject(s, productId, rng) ? ok(s) : fail(state, "That product is not waiting for approval.");
}

export function assignMission(state: GameState, workerId: string, templateId: string, rng: Rng = Math.random): ActionResult {
  const s = draftOf(state);
  const err = assignMissionDraft(s, workerId, templateId, rng);
  if (err) return fail(state, err);
  const w = s.workers.find((x) => x.id === workerId);
  const room = w ? findRoom(s.building, w.homeRoom) : undefined;
  if (w && room && w.activity !== "resting") sendWorker(w, room, pickSpot(room, WORK_KINDS, s.workers, rng, w.id) ?? 0, "working");
  return ok(s);
}

export function resolveEvent(state: GameState, eventId: string, choice: number, rng: Rng = Math.random): ActionResult {
  const s = draftOf(state);
  const ev = s.pendingEvents.find((e) => e.id === eventId);
  if (!ev) return fail(state, "That event is already over.");
  if (ev.kind === "poaching" && choice === 0 && Number(ev.data.cost) > s.cash) return fail(state, "Not enough cash for the counter-offer.");
  if (ev.kind === "outage" && choice === 0 && 400 > s.cash) return fail(state, "Not enough cash for the repair.");
  if (ev.kind === "refund" && choice === 0 && 250 > s.cash) return fail(state, "Not enough cash for the refunds.");
  if (ev.kind === "viral" && choice === 1 && 300 > s.cash) return fail(state, "Not enough cash to boost it.");
  const err = resolveEventDraft(s, eventId, choice, rng);
  return err ? fail(state, err) : ok(s);
}
