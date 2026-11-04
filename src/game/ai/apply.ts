/**
 * Apply validated AI output to the game. Every action is checked against the current
 * game state here (the server only checks shape), so the model can never do something
 * the player could not.
 */
import * as A from "../actions";
import { findRoom, roomByType } from "../building";
import { clamp, draftOf, log, nextId } from "../draft";
import { fairSalary } from "../economy";
import { removeWorker } from "../events";
import { MISSIONS } from "../missions";
import { pickSpot, REST_KINDS, sendWorker, WORK_KINDS, type Rng } from "../movement";
import { clockOf, dayOf } from "../time";
import type { ChatMessage, GameState, MeetingLine, MeetingRecord, Worker } from "../types";
import { addMemory } from "./scripted";
import { TASK_FOCUS, TASK_LABEL, type AiAction, type CompanySummary, type MeetingDecision, type WorkerBrief } from "./types";
import { BUSINESS_INFO, BUSINESSES } from "../business";

const CHAT_CAP = 60;

export function briefOf(w: Worker): WorkerBrief {
  return {
    id: w.id,
    name: w.name,
    role: w.role,
    personality: w.personality,
    mood: Math.round(w.mood),
    energy: Math.round(w.energy),
    loyalty: Math.round(w.loyalty),
    salary: w.salary,
    fairSalary: fairSalary(w.skill),
    skill: w.skill,
    task: w.task,
    focus: w.focus,
  };
}

export function companyOf(g: GameState): CompanySummary {
  const top = BUSINESSES.map((b) => [b, g.economy.today.byBusiness[b]] as const).sort((a, b) => b[1] - a[1])[0];
  return {
    name: g.company.name,
    day: dayOf(g.minutes),
    clock: clockOf(g.minutes),
    cash: Math.round(g.cash),
    revenueToday: Math.round(g.economy.today.revenue),
    topBusiness: top && top[1] > 0 ? BUSINESS_INFO[top[0]].name : "",
    liveProducts: g.products.filter((p) => p.stage === "done").length,
    waitingApproval: g.products.filter((p) => p.stage === "approval").length,
    lockedRooms: g.building.rooms.filter((r) => r.locked).map((r) => r.type),
  };
}

function push(s: GameState, workerId: string, msg: Omit<ChatMessage, "id" | "t">): ChatMessage {
  const full: ChatMessage = { ...msg, id: nextId(s, "m"), t: s.minutes };
  const thread = [...(s.chats[workerId] ?? []), full];
  s.chats = { ...s.chats, [workerId]: thread.length > CHAT_CAP ? thread.slice(thread.length - CHAT_CAP) : thread };
  return full;
}

export function addPlayerMessage(state: GameState, workerId: string, text: string): GameState {
  const s = { ...state, chats: { ...state.chats } };
  push(s, workerId, { from: "player", text });
  return s;
}

export interface ApplyOutcome {
  state: GameState;
  /** human-readable note about what happened (or why not), shown in chat/log */
  note: string | null;
}

/** Apply one worker action. Invalid or impossible actions are dropped with a note. */
export function applyWorkerAction(state: GameState, workerId: string, action: AiAction | null, rng: Rng = Math.random): ApplyOutcome {
  if (!action) return { state, note: null };
  const w = state.workers.find((x) => x.id === workerId);
  if (!w) return { state, note: null };

  switch (action.type) {
    case "assignTask": {
      const r = A.setFocus(state, workerId, TASK_FOCUS[action.task], rng);
      if (r.error) return { state, note: r.error };
      const s = draftOf(r.state);
      const sw = s.workers.find((x) => x.id === workerId)!;
      sw.task = TASK_LABEL[action.task];
      sw.taskProgress = 0;
      log(s, `${sw.name} switched to: ${sw.task}.`, "info");
      return { state: s, note: `${sw.name} → ${sw.task}` };
    }
    case "goTo": {
      const room = roomByType(state.building, action.room);
      if (!room || room.locked) return { state, note: `${w.name} can't go there: it isn't built yet.` };
      const s = draftOf(state);
      const sw = s.workers.find((x) => x.id === workerId)!;
      const resting = action.room === "CHILL";
      const kinds = resting ? REST_KINDS : ["stand" as const, "chair" as const, ...WORK_KINDS];
      sendWorker(sw, room, pickSpot(room, kinds, s.workers, rng, sw.id) ?? 0, resting ? "resting" : "visiting");
      return { state: s, note: `${sw.name} is heading to the ${room.type.replace("_", " ").toLowerCase()}` };
    }
    case "takeBreak": {
      const chill = roomByType(state.building, "CHILL");
      if (!chill) return { state, note: null };
      const s = draftOf(state);
      const sw = s.workers.find((x) => x.id === workerId)!;
      sendWorker(sw, chill, pickSpot(chill, REST_KINDS, s.workers, rng, sw.id) ?? 0, "resting");
      return { state: s, note: `${sw.name} is taking a break` };
    }
    case "askRaise": {
      // Attach a raise request to the worker's latest message so the boss can answer it.
      const s = { ...state, chats: { ...state.chats } };
      const thread = [...(s.chats[workerId] ?? [])];
      const open = thread.some((m) => m.request?.status === "open");
      if (open) return { state, note: null };
      let idx = -1;
      for (let i = thread.length - 1; i >= 0; i--) {
        if (thread[i].from === "worker") {
          idx = i;
          break;
        }
      }
      if (idx < 0) return { state, note: null };
      thread[idx] = { ...thread[idx], request: { type: "raise", amount: action.amount, status: "open" } };
      s.chats[workerId] = thread;
      return { state: s, note: null };
    }
    case "quit": {
      if (w.loyalty >= 20) return { state, note: null };
      const s = draftOf(state);
      removeWorker(s, workerId, "quit after a conversation with the boss.");
      return { state: s, note: `${w.name} quit.` };
    }
  }
}

/** Book a worker's chat reply: messages, memory, mood and action. */
export function applyChatReply(
  state: GameState,
  workerId: string,
  reply: { reply: string; action: AiAction | null; newMemory: string | null; moodDelta: number },
  source: "ai" | "script",
  rng: Rng = Math.random,
): ApplyOutcome {
  if (!state.workers.some((x) => x.id === workerId)) return { state, note: null };
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId)!;
  for (const line of reply.reply.split("\n").filter(Boolean)) push(s, workerId, { from: "worker", text: line, source });
  if (reply.newMemory) w.memories = addMemory(w.memories, reply.newMemory);
  w.mood = clamp(w.mood + clamp(reply.moodDelta, -10, 10));
  return applyWorkerAction(s, workerId, reply.action, rng);
}

/** The boss answers a raise request. */
export function answerRaise(state: GameState, workerId: string, messageId: string, approve: boolean, rng: Rng = Math.random): A.ActionResult {
  const thread = state.chats[workerId] ?? [];
  const msg = thread.find((m) => m.id === messageId);
  if (!msg?.request || msg.request.status !== "open") return { state, error: "That request was already answered." };
  let next = state;
  if (approve) {
    const r = A.giveRaise(state, workerId, msg.request.amount, rng);
    if (r.error) return r;
    next = r.state;
  } else {
    const s = draftOf(state);
    const w = s.workers.find((x) => x.id === workerId);
    if (w) {
      w.mood = clamp(w.mood - 6);
      w.loyalty = clamp(w.loyalty - 4);
      push(s, workerId, { from: "worker", text: w.mood < 40 ? "...ok. noted." : "ok, fair. maybe next month then", source: "script" });
    }
    next = s;
  }
  const chats = { ...next.chats };
  chats[workerId] = (chats[workerId] ?? []).map((m) => (m.id === messageId && m.request ? { ...m, request: { ...m.request, status: approve ? ("approved" as const) : ("declined" as const) } } : m));
  return { state: { ...next, chats }, error: null };
}

/** A worker texting first. */
export function applyInitiated(state: GameState, workerId: string, text: string, action: AiAction | null, source: "ai" | "script", rng: Rng = Math.random): GameState {
  if (!state.workers.some((x) => x.id === workerId)) return state;
  const s = draftOf(state);
  const w = s.workers.find((x) => x.id === workerId)!;
  w.lastTextAt = s.minutes;
  for (const line of text.split("\n").filter(Boolean)) push(s, workerId, { from: "worker", text: line, source });
  return action?.type === "askRaise" ? applyWorkerAction(s, workerId, action, rng).state : s;
}

// ---------------------------------------------------------------- meetings

/** Walk attendees to the War Room. */
export function gatherMeeting(state: GameState, attendeeIds: string[], rng: Rng = Math.random): A.ActionResult {
  const war = findRoom(state.building, "war_room");
  if (!war || war.locked) return { state, error: "The War Room is not available." };
  const s = draftOf(state);
  for (const id of attendeeIds) {
    const w = s.workers.find((x) => x.id === id);
    if (!w) continue;
    sendWorker(w, war, pickSpot(war, ["chair", "stand"], s.workers, rng, w.id) ?? 0, "meeting");
    w.bubble = null;
  }
  return { state: s, error: null };
}

export function setSpeaking(state: GameState, workerName: string | null, until: number): GameState {
  if (!workerName) return state;
  const workers = state.workers.map((w) => (w.name === workerName ? { ...w, bubble: { icon: "talk" as const, until } } : w));
  return { ...state, workers };
}

export interface DecisionOutcome {
  summary: string;
  applied: boolean;
  note: string;
}

/** Apply meeting decisions, then send everyone back to work and archive the transcript. */
export function finishMeeting(
  state: GameState,
  meeting: { topic: string; attendees: string[]; lines: MeetingLine[]; decisions: MeetingDecision[] },
  rng: Rng = Math.random,
): { state: GameState; outcomes: DecisionOutcome[] } {
  let s = state;
  const outcomes: DecisionOutcome[] = [];
  for (const d of meeting.decisions) {
    const a = d.action;
    if (!a) {
      outcomes.push({ summary: d.summary, applied: false, note: "noted" });
      continue;
    }
    let r: A.ActionResult;
    if (a.type === "assignTask") {
      const res = applyWorkerAction(s, a.worker, { type: "assignTask", task: a.task }, rng);
      r = { state: res.state, error: res.state === s ? (res.note ?? "Could not apply.") : null };
    } else if (a.type === "setBudget") {
      r = A.setBudget(s, a.business, a.amount);
    } else {
      r = MISSIONS.some((m) => m.id === a.mission) ? A.assignMission(s, a.worker, a.mission, rng) : { state: s, error: "Unknown mission." };
    }
    if (r.error) outcomes.push({ summary: d.summary, applied: false, note: r.error });
    else {
      s = r.state;
      outcomes.push({ summary: d.summary, applied: true, note: "done" });
    }
  }

  const d = draftOf(s);
  for (const id of meeting.attendees) {
    const w = d.workers.find((x) => x.id === id);
    if (!w) continue;
    if (w.bubble?.icon === "talk") w.bubble = null;
    if (w.activity === "meeting") w.timer = 0;
    if (w.target?.purpose === "meeting") w.target = { ...w.target, purpose: "visiting" };
  }
  const record: MeetingRecord = {
    id: nextId(d, "mt"),
    topic: meeting.topic,
    t: d.minutes,
    attendees: meeting.attendees,
    lines: meeting.lines,
    decisions: outcomes.map((o) => `${o.applied ? "✓" : "•"} ${o.summary}`),
  };
  d.meetings = [...d.meetings, record].slice(-5);
  log(d, `Meeting on "${meeting.topic}": ${outcomes.filter((o) => o.applied).length} decision(s) applied.`, "good");
  return { state: d, outcomes };
}
