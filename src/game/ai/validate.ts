/**
 * Validation for everything that crosses a trust boundary:
 * client payloads (checked on the server) and model output (checked on the server and again on the client).
 */
import { BUSINESSES } from "../business";
import type { BusinessId, Focus, MeetingLine } from "../types";
import {
  AI_ROOMS,
  AI_TASKS,
  LIMITS,
  type AiAction,
  type AiRequest,
  type AiRoom,
  type AiTask,
  type ChatResult,
  type CompanySummary,
  type HistoryItem,
  type InitiateResult,
  type MeetingAction,
  type MeetingDecision,
  type MeetingResult,
  type WorkerBrief,
} from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, dflt = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

const FOCUSES: Focus[] = ["shop", "freelance", "music", "social", "research", "ops", "wild"];

/** Phrases that break the fiction. Replies containing them are rejected. */
const FICTION_BREAKERS = [/\bas an ai\b/i, /\blanguage model\b/i, /\bi('| a)m an? (ai|assistant|chatbot|bot)\b/i, /\bai assistant\b/i, /\bopenai\b|\bgoogle gemini\b/i];

export function breaksFiction(text: string): boolean {
  return FICTION_BREAKERS.some((r) => r.test(text));
}

/** Parse model text as JSON, tolerating code fences and leading chatter. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------- actions

export function sanitizeAction(raw: unknown): AiAction | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case "assignTask": {
      const task = str(raw.task, 40) as AiTask;
      return AI_TASKS.includes(task) ? { type: "assignTask", task } : null;
    }
    case "goTo": {
      const room = str(raw.room, 40).toUpperCase().replace(/[\s/]+/g, "_") as AiRoom;
      return AI_ROOMS.includes(room) ? { type: "goTo", room } : null;
    }
    case "takeBreak":
      return { type: "takeBreak" };
    case "askRaise": {
      const amount = Math.round(num(raw.amount, 0, 1000, 0));
      return amount >= 5 ? { type: "askRaise", amount: Math.min(150, amount) } : null;
    }
    case "quit":
      return { type: "quit" };
    default:
      return null;
  }
}

/** Map a worker name or id (any case) to an id from the list. */
export function workerResolver(workers: { id: string; name: string }[]): (v: string) => string | null {
  const map = new Map<string, string>();
  for (const w of workers) {
    map.set(w.id.toLowerCase(), w.id);
    map.set(w.name.toLowerCase(), w.id);
  }
  return (v) => map.get(v.trim().toLowerCase()) ?? null;
}

export function sanitizeMeetingAction(
  raw: unknown,
  resolveWorker: (v: string) => string | null,
  missionIds: string[],
): MeetingAction | null {
  if (!isObj(raw)) return null;
  const worker = resolveWorker(str(raw.worker, 40));
  switch (raw.type) {
    case "assignTask": {
      const task = str(raw.task, 40) as AiTask;
      return worker && AI_TASKS.includes(task) ? { type: "assignTask", worker, task } : null;
    }
    case "setBudget": {
      const business = str(raw.business, 20).toLowerCase() as BusinessId;
      if (!BUSINESSES.includes(business)) return null;
      return { type: "setBudget", business, amount: Math.round(num(raw.amount, 0, 500, 0) / 10) * 10 };
    }
    case "assignMission": {
      const mission = str(raw.mission, 40);
      return worker && missionIds.includes(mission) ? { type: "assignMission", worker, mission } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- model output

/** At most 3 short messages, split by newlines. */
export function normalizeReply(text: string): string {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((l) => l.slice(0, 280))
    .join("\n");
}

export function validateChatResult(raw: unknown): ChatResult | null {
  if (!isObj(raw)) return null;
  const reply = normalizeReply(typeof raw.reply === "string" ? raw.reply : "");
  if (!reply || breaksFiction(reply)) return null;
  const memory = str(raw.newMemory, LIMITS.memoryText);
  return {
    reply,
    action: sanitizeAction(raw.action),
    newMemory: memory && !/^null$/i.test(memory) ? memory : null,
    moodDelta: Math.round(num(raw.moodDelta, -10, 10, 0)),
  };
}

export function validateMeetingResult(
  raw: unknown,
  attendees: { id: string; name: string }[],
  missionIds: string[],
  minLines = 3,
): MeetingResult | null {
  if (!isObj(raw) || !Array.isArray(raw.lines)) return null;
  const byName = new Map(attendees.map((a) => [a.name.toLowerCase(), a.name]));
  const lines: MeetingLine[] = [];
  for (const l of raw.lines.slice(0, 14)) {
    if (!isObj(l)) continue;
    const speaker = byName.get(str(l.speaker, 40).toLowerCase());
    const text = str(l.text, 300);
    if (speaker && text && !breaksFiction(text)) lines.push({ speaker, text });
  }
  if (lines.length < minLines) return null;
  const resolve = workerResolver(attendees);
  const decisions: MeetingDecision[] = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .slice(0, 3)
    .filter(isObj)
    .map((d) => ({ summary: str(d.summary, 160), action: sanitizeMeetingAction(d.action, resolve, missionIds) }))
    .filter((d) => d.summary || d.action);
  return { lines: lines.slice(0, 12), decisions };
}

export function validateInitiateResult(raw: unknown): InitiateResult | null {
  if (!isObj(raw)) return null;
  const text = normalizeReply(typeof raw.text === "string" ? raw.text : "");
  if (!text || breaksFiction(text)) return null;
  const action = sanitizeAction(raw.action);
  // Workers may only ask for things when they text first, never act on their own.
  return { text, action: action?.type === "askRaise" ? action : null };
}

// ---------------------------------------------------------------- client payloads

function brief(raw: unknown): WorkerBrief | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 40);
  const name = str(raw.name, 40);
  if (!id || !name) return null;
  const focus = str(raw.focus, 20) as Focus;
  return {
    id,
    name,
    role: str(raw.role, 60),
    personality: str(raw.personality, 160),
    mood: num(raw.mood, 0, 100, 50),
    energy: num(raw.energy, 0, 100, 50),
    loyalty: num(raw.loyalty, 0, 100, 50),
    salary: num(raw.salary, 0, 10000, 100),
    fairSalary: num(raw.fairSalary, 0, 10000, 100),
    skill: num(raw.skill, 0, 100, 50),
    task: str(raw.task, 80),
    focus: FOCUSES.includes(focus) ? focus : "ops",
  };
}

function company(raw: unknown): CompanySummary {
  const o = isObj(raw) ? raw : {};
  return {
    name: str(o.name, 40) || "NEON HQ",
    day: Math.round(num(o.day, 1, 100000, 1)),
    clock: str(o.clock, 8),
    cash: Math.round(num(o.cash, -1e9, 1e12, 0)),
    revenueToday: Math.round(num(o.revenueToday, -1e9, 1e12, 0)),
    topBusiness: str(o.topBusiness, 30),
    liveProducts: Math.round(num(o.liveProducts, 0, 10000, 0)),
    waitingApproval: Math.round(num(o.waitingApproval, 0, 10000, 0)),
    lockedRooms: Array.isArray(o.lockedRooms) ? o.lockedRooms.slice(0, 12).map((r) => str(r, 30)).filter(Boolean) : [],
  };
}

function memories(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.slice(-LIMITS.memories).map((m) => str(m, LIMITS.memoryText)).filter(Boolean) : [];
}

/** Validate and trim a request body. Returns the request or an error message. */
export function validateRequest(raw: unknown): AiRequest | string {
  if (!isObj(raw)) return "Body must be a JSON object.";
  switch (raw.kind) {
    case "chat": {
      const worker = brief(raw.worker);
      const message = str(raw.message, LIMITS.message);
      if (!worker) return "Missing worker.";
      if (!message) return "Missing message.";
      const history: HistoryItem[] = (Array.isArray(raw.history) ? raw.history : [])
        .slice(-LIMITS.historyItems)
        .filter(isObj)
        .map((h) => ({ from: h.from === "player" ? ("player" as const) : ("worker" as const), text: str(h.text, LIMITS.historyText) }))
        .filter((h) => h.text);
      return { kind: "chat", worker, memories: memories(raw.memories), history, company: company(raw.company), message };
    }
    case "meeting": {
      const topic = str(raw.topic, LIMITS.topic);
      const attendees = (Array.isArray(raw.attendees) ? raw.attendees : []).slice(0, LIMITS.attendees).map(brief).filter((b): b is WorkerBrief => !!b);
      if (!topic) return "Missing topic.";
      if (attendees.length < 2) return "A meeting needs at least 2 attendees.";
      const transcript: MeetingLine[] = (Array.isArray(raw.transcript) ? raw.transcript : [])
        .slice(-LIMITS.transcript)
        .filter(isObj)
        .map((l) => ({ speaker: str(l.speaker, 40), text: str(l.text, 300) }))
        .filter((l) => l.speaker && l.text);
      const missions = (Array.isArray(raw.missions) ? raw.missions : [])
        .slice(0, 12)
        .filter(isObj)
        .map((m) => ({ id: str(m.id, 40), title: str(m.title, 80) }))
        .filter((m) => m.id);
      const playerLine = str(raw.playerLine, LIMITS.message) || null;
      return { kind: "meeting", topic, attendees, company: company(raw.company), missions, transcript, playerLine };
    }
    case "initiate": {
      const worker = brief(raw.worker);
      const situation = str(raw.situation, 300);
      if (!worker || !situation) return "Missing worker or situation.";
      return { kind: "initiate", worker, memories: memories(raw.memories), company: company(raw.company), situation };
    }
    default:
      return "Unknown request kind.";
  }
}
