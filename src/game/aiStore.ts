"use client";

/**
 * Async AI flows (chat, meetings, worker-initiated texts). They read the latest game state
 * when results arrive, because the world keeps running while the model thinks.
 */
import { askAi } from "@/lib/aiClient";
import {
  addPlayerMessage,
  addSystemMessage,
  answerRaise as answerRaiseFn,
  applyChatMeta,
  applyInitiated,
  briefOf,
  pushWorkerLine,
  companyOf,
  finishMeeting,
  gatherMeeting,
  setSpeaking,
} from "./ai/apply";
import {
  extractMemory,
  scriptedChat,
  scriptedInitiate,
  scriptedMeeting,
  scriptedMeetingReply,
  type Situation,
} from "./ai/scripted";
import type { ChatResult, MeetingResult } from "./ai/types";
import { validateChatResult, validateInitiateResult, validateMeetingResult } from "./ai/validate";
import { fairSalary } from "./economy";
import { MISSIONS } from "./missions";
import { useGame } from "./store";
import type { GameState } from "./types";

const get = () => useGame.getState();
const set = useGame.setState;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replies never arrive faster than this, so it feels like typing. */
const MIN_TYPING_MS = 1000;

function commit(game: GameState): void {
  set({ game });
}

// ---------------------------------------------------------------- chat

export async function sendChat(workerId: string, text: string): Promise<void> {
  const message = text.trim().slice(0, 500);
  const g0 = get().game;
  if (!message || !g0) return;
  const worker = g0.workers.find((w) => w.id === workerId);
  if (!worker) return;

  const history = (g0.chats[workerId] ?? [])
    .filter((m) => m.from !== "system")
    .slice(-20)
    .map((m) => ({ from: m.from as "player" | "worker", text: m.text }));
  commit(addPlayerMessage(g0, workerId, message));
  set({ chatPending: { ...get().chatPending, [workerId]: true } });

  const started = Date.now();
  const ai = await askAi(
    { kind: "chat", worker: briefOf(worker), memories: worker.memories, history, company: companyOf(g0), message },
    validateChatResult,
    g0.settings.ai,
  );
  const latest = get().game;
  const current = latest?.workers.find((w) => w.id === workerId);
  if (!latest || !current) {
    set({ chatPending: { ...get().chatPending, [workerId]: false } });
    return;
  }
  const result: ChatResult = ai?.data ?? scriptedChat(briefOf(current), current.memories, message);
  // Belt and braces: catch obvious facts even if the model forgot to save them.
  if (!result.newMemory) result.newMemory = extractMemory(message);
  const source = ai ? "ai" : "script";

  // Replies land 1-3 s after sending; longer replies arrive as separate bubbles.
  const lines = result.reply.split("\n").filter(Boolean).slice(0, 3);
  const firstWait = Math.max(MIN_TYPING_MS, Math.min(3000, 500 + lines[0].length * 25)) - (Date.now() - started);
  if (firstWait > 0) await sleep(firstWait);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await sleep(Math.min(1400, 350 + lines[i].length * 18));
    const g = get().game;
    if (!g) return;
    commit(pushWorkerLine(g, workerId, lines[i], source));
  }
  const g1 = get().game;
  if (!g1) return;
  const out = applyChatMeta(g1, workerId, result);
  commit(out.state);
  set({ chatPending: { ...get().chatPending, [workerId]: false } });
}

/** Chat quick action: a $100 bonus with a system chip in the thread. */
export function chatBonus(workerId: string, amount: number): void {
  const st = get();
  if (!st.payBonus(workerId, amount)) return;
  const g = get().game;
  if (g) commit(addSystemMessage(g, workerId, `You paid a $${amount} bonus`));
}

export function answerRaise(workerId: string, messageId: string, approve: boolean): void {
  const g = get().game;
  if (!g) return;
  const r = answerRaiseFn(g, workerId, messageId, approve);
  if (r.error) get().toast(r.error, "error");
  else commit(r.state);
}

// ---------------------------------------------------------------- meetings

const LINE_INTERVAL_MS = 1600;

export async function startMeeting(topic: string, attendeeIds: string[]): Promise<boolean> {
  const g = get().game;
  const t = topic.trim().slice(0, 100);
  if (!g) return false;
  if (get().meeting?.status === "running") {
    get().toast("A meeting is already running.", "error");
    return false;
  }
  const attendees = g.workers.filter((w) => attendeeIds.includes(w.id));
  if (!t || attendees.length < 2) {
    get().toast("Pick a topic and at least 2 people.", "error");
    return false;
  }
  const gathered = gatherMeeting(g, attendees.map((w) => w.id));
  if (gathered.error) {
    get().toast(gathered.error, "error");
    return false;
  }
  commit(gathered.state);
  set({
    meeting: { topic: t, attendees: attendees.map((w) => w.id), lines: [], shown: 0, decisions: [], outcomes: null, busy: true, source: null, status: "running" },
  });

  const briefs = attendees.map(briefOf);
  const ai = await askAi(
    {
      kind: "meeting",
      topic: t,
      attendees: briefs,
      company: companyOf(g),
      missions: MISSIONS.map((m) => ({ id: m.id, title: m.title })),
      transcript: [],
      playerLine: null,
    },
    (d) => validateMeetingResult(d, briefs, MISSIONS.map((m) => m.id), 3),
    g.settings.ai,
  );
  const result: MeetingResult = ai?.data ?? scriptedMeeting(t, briefs);
  // A meeting must end with something actionable.
  if (!result.decisions.some((d) => d.action)) result.decisions.push(...scriptedMeeting(t, briefs).decisions.slice(0, 1));
  const m = get().meeting;
  if (!m) return false;
  set({ meeting: { ...m, lines: [...m.lines, ...result.lines], decisions: result.decisions, busy: false, source: ai ? "ai" : "script" } });
  return true;
}

export async function meetingSay(text: string): Promise<void> {
  const m = get().meeting;
  const g = get().game;
  const line = text.trim().slice(0, 300);
  if (!m || !g || m.status !== "running" || !line) return;
  const lines = [...m.lines.slice(0, m.shown), { speaker: "You", text: line }];
  // The boss interrupts: unrevealed lines are dropped and the crew reacts instead.
  set({ meeting: { ...m, lines, shown: lines.length, busy: true } });

  const attendees = g.workers.filter((w) => m.attendees.includes(w.id));
  const briefs = attendees.map(briefOf);
  const ai = await askAi(
    {
      kind: "meeting",
      topic: m.topic,
      attendees: briefs,
      company: companyOf(g),
      missions: MISSIONS.map((x) => ({ id: x.id, title: x.title })),
      transcript: lines,
      playerLine: line,
    },
    (d) => validateMeetingResult(d, briefs, MISSIONS.map((x) => x.id), 2),
    g.settings.ai,
  );
  const result = ai?.data ?? scriptedMeetingReply(line, briefs);
  const cur = get().meeting;
  if (!cur) return;
  const decisions = result.decisions.length ? [...result.decisions, ...cur.decisions].slice(0, 3) : cur.decisions;
  set({ meeting: { ...cur, lines: [...cur.lines, ...result.lines], decisions, busy: false, source: ai ? "ai" : (cur.source ?? "script") } });
}

/** Reveal the next line; when all lines are out and nobody is waiting on the model, apply decisions. */
export function advanceMeeting(): void {
  const m = get().meeting;
  const g = get().game;
  if (!m || !g || m.status !== "running") return;
  if (m.shown < m.lines.length) {
    const line = m.lines[m.shown];
    commit(setSpeaking(g, line.speaker === "You" ? null : line.speaker, g.minutes + 3));
    set({ meeting: { ...m, shown: m.shown + 1 } });
    return;
  }
  if (m.busy || m.lines.length === 0) return;
  const { state, outcomes } = finishMeeting(g, m);
  commit(state);
  set({ meeting: { ...m, status: "done", outcomes } });
}

export function closeMeeting(): void {
  const m = get().meeting;
  const g = get().game;
  if (m && g && m.status === "running") {
    // Leaving early: send everyone back without applying decisions.
    const { state } = finishMeeting(g, { ...m, decisions: [] });
    commit(state);
  }
  set({ meeting: null });
}

export const MEETING_LINE_INTERVAL_MS = LINE_INTERVAL_MS;

// ---------------------------------------------------------------- workers texting first

/** Each worker texts at most once per 30 game minutes. */
export const TEXT_COOLDOWN_MIN = 30;
/** Average across the crew: about one text per game hour. */
const TEXTS_PER_MINUTE = 1 / 60;
const AI_SHARE = 0.2;
const inFlight = new Set<string>();
let lastCheck: number | null = null;

function situationFor(g: GameState, id: string): { situation: Situation; detail: string } {
  const w = g.workers.find((x) => x.id === id)!;
  if (w.energy < 20) return { situation: "tired", detail: "" };
  if (w.mood < 30) return { situation: "grumpy", detail: "" };
  const openRaise = (g.chats[id] ?? []).some((m) => m.request?.status === "open");
  if (!openRaise && w.salary < fairSalary(w.skill) * 0.9 && w.loyalty < 55) return { situation: "raise", detail: "" };
  const mission = g.missions.find((m) => m.workerId === id && m.status === "active");
  if (mission && mission.progress > 0) {
    return { situation: "mission", detail: `${mission.title}: ${Math.floor(mission.progress)}/${mission.target}` };
  }
  const yesterday = g.economy.history[g.economy.history.length - 1];
  if (yesterday && g.economy.today.revenue > yesterday.revenue * 1.1 && g.minutes % 1440 > 12 * 60) {
    return { situation: "celebrate", detail: `$${Math.round(g.economy.today.revenue).toLocaleString("en-US")} in revenue today` };
  }
  return { situation: "smalltalk", detail: "" };
}

const SITUATION_TEXT: Record<Situation, string> = {
  tired: "You are exhausted and want the boss to know.",
  grumpy: "You are in a bad mood about work today.",
  raise: "You feel underpaid and want to ask for a raise.",
  mission: "Give the boss a quick progress update on your mission",
  celebrate: "Celebrate a great day with the boss",
  approval: "Remind the boss that your design is waiting for approval in the Factory",
  smalltalk: "Send a casual status update or an idea for the business.",
};

/** Called every few real seconds. Picks at most one worker to text the boss. */
export async function workerTextTick(rng: () => number = Math.random): Promise<void> {
  const st = get();
  const g = st.game;
  if (!g || st.away || g.settings.speed === 0) return;
  if (lastCheck === null || g.minutes < lastCheck) {
    lastCheck = g.minutes;
    return;
  }
  const elapsed = g.minutes - lastCheck;
  if (elapsed < 2) return;
  lastCheck = g.minutes;

  const eligible = g.workers.filter((w) => g.minutes - w.lastTextAt >= TEXT_COOLDOWN_MIN && !inFlight.has(w.id) && !st.chatPending[w.id]);
  if (eligible.length === 0 || rng() >= Math.min(0.9, elapsed * TEXTS_PER_MINUTE)) return;
  const w = eligible[Math.floor(rng() * eligible.length)];
  const { situation, detail } = situationFor(g, w.id);

  inFlight.add(w.id);
  // Claim the slot right away so the cooldown holds while the model thinks.
  commit({ ...g, workers: g.workers.map((x) => (x.id === w.id ? { ...x, lastTextAt: g.minutes } : x)) });
  try {
    const useAi = g.settings.ai && rng() < AI_SHARE;
    const ai = useAi
      ? await askAi(
          {
            kind: "initiate",
            worker: briefOf(w),
            memories: w.memories,
            company: companyOf(g),
            situation: `${SITUATION_TEXT[situation]}${detail ? ` (${detail})` : ""}`,
          },
          validateInitiateResult,
          true,
        )
      : null;
    const result = ai?.data ?? scriptedInitiate(briefOf(w), situation, detail);
    const latest = get().game;
    if (latest) commit(applyInitiated(latest, w.id, result.text, result.action, ai ? "ai" : "script"));
  } finally {
    inFlight.delete(w.id);
  }
}
