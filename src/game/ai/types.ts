/** The contract between the game client, the /api/chat route and the model. */
import type { BusinessId, Focus, MeetingLine } from "../types";

/** Tasks a worker can be told to do. Each maps to a business focus. */
export const AI_TASKS = ["shop_designs", "freelance_gigs", "music_tracks", "social_content", "research", "operations", "experiments"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const TASK_FOCUS: Record<AiTask, Focus> = {
  shop_designs: "shop",
  freelance_gigs: "freelance",
  music_tracks: "music",
  social_content: "social",
  research: "research",
  operations: "ops",
  experiments: "wild",
};

export const TASK_LABEL: Record<AiTask, string> = {
  shop_designs: "Designing shop products",
  freelance_gigs: "Delivering freelance gigs",
  music_tracks: "Producing music tracks",
  social_content: "Making social content",
  research: "Researching new products",
  operations: "Running operations",
  experiments: "Running experiments",
};

/** Rooms a worker can be sent to (by room type). */
export const AI_ROOMS = ["COMMAND", "WAR_ROOM", "REVENUE_BAY", "TREASURY", "FACTORY", "CHILL", "SERVER_ROOM"] as const;
export type AiRoom = (typeof AI_ROOMS)[number];

/** Actions a worker may request in a chat reply. */
export type AiAction =
  | { type: "assignTask"; task: AiTask }
  | { type: "goTo"; room: AiRoom }
  | { type: "takeBreak" }
  | { type: "askRaise"; amount: number }
  | { type: "quit" };

/** Actions a meeting may decide. */
export type MeetingAction =
  | { type: "assignTask"; worker: string; task: AiTask }
  | { type: "setBudget"; business: BusinessId; amount: number }
  | { type: "assignMission"; worker: string; mission: string };

export interface MeetingDecision {
  summary: string;
  action: MeetingAction | null;
}

/** What the client tells the server about a worker. */
export interface WorkerBrief {
  id: string;
  name: string;
  role: string;
  personality: string;
  mood: number;
  energy: number;
  loyalty: number;
  salary: number;
  fairSalary: number;
  skill: number;
  task: string;
  focus: Focus;
}

export interface CompanySummary {
  name: string;
  day: number;
  clock: string;
  cash: number;
  revenueToday: number;
  topBusiness: string;
  liveProducts: number;
  waitingApproval: number;
  lockedRooms: string[];
}

export interface HistoryItem {
  from: "player" | "worker";
  text: string;
}

export interface ChatRequest {
  kind: "chat";
  worker: WorkerBrief;
  memories: string[];
  history: HistoryItem[];
  company: CompanySummary;
  message: string;
}

export interface MeetingRequest {
  kind: "meeting";
  topic: string;
  attendees: WorkerBrief[];
  company: CompanySummary;
  missions: { id: string; title: string }[];
  /** lines so far when the boss interjects */
  transcript: MeetingLine[];
  playerLine: string | null;
}

export interface InitiateRequest {
  kind: "initiate";
  worker: WorkerBrief;
  memories: string[];
  company: CompanySummary;
  situation: string;
}

export type AiRequest = ChatRequest | MeetingRequest | InitiateRequest;

export interface ChatResult {
  reply: string;
  action: AiAction | null;
  newMemory: string | null;
  moodDelta: number;
}

export interface MeetingResult {
  lines: MeetingLine[];
  decisions: MeetingDecision[];
}

export interface InitiateResult {
  text: string;
  action: AiAction | null;
}

/** Server response envelope. ok:false tells the client to use a scripted reply. */
export type AiResponse<T> = { ok: true; data: T; model: string } | { ok: false; reason: string };

export const LIMITS = {
  message: 500,
  historyItems: 20,
  historyText: 600,
  memories: 30,
  memoryText: 200,
  topic: 100,
  attendees: 7,
  transcript: 40,
  bodyBytes: 48_000,
} as const;
