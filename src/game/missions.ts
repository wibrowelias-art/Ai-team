/** Missions: a worker gets a measurable goal with a deadline and a cash reward. */
import { FOCUS_ROOM } from "./business";
import { clamp, log, nextId, otherIncome, say } from "./draft";
import { line } from "./lines";
import type { Focus, GameState, Mission, ProductType } from "./types";

export interface MissionTemplate {
  id: string;
  title: string;
  /** the worker switches to this focus while on the mission */
  focus: Focus;
  /** how far the metric must move from its starting value */
  target: (s: GameState) => number;
  metric: (s: GameState) => number;
  reward: number;
  days: number;
  unit: string;
}

const countLive = (type: ProductType) => (s: GameState) => s.economy.launched[type];

export const MISSIONS: MissionTemplate[] = [
  {
    id: "shirts5",
    title: "Launch 5 new shirt designs",
    focus: "shop",
    metric: countLive("tshirt"),
    target: () => 5,
    reward: 600,
    days: 2,
    unit: "shirts",
  },
  {
    id: "social20",
    title: "Grow Social by 20%",
    focus: "social",
    metric: (s) => s.economy.businesses.social.followers,
    target: (s) => Math.round(s.economy.businesses.social.followers * 0.2),
    reward: 500,
    days: 2,
    unit: "followers",
  },
  {
    id: "freelance1k",
    title: "Bank $1,000 in freelance gigs",
    focus: "freelance",
    metric: (s) => s.economy.businesses.freelance.totalRevenue,
    target: () => 1000,
    reward: 400,
    days: 2,
    unit: "$",
  },
  {
    id: "tracks3",
    title: "Release 3 new tracks",
    focus: "music",
    metric: countLive("song"),
    target: () => 3,
    reward: 500,
    days: 3,
    unit: "tracks",
  },
  {
    id: "research",
    title: "Unlock a new product line",
    focus: "research",
    metric: (s) => s.economy.businesses.research.points,
    target: () => 20,
    reward: 400,
    days: 3,
    unit: "points",
  },
];

export function missionTemplate(id: string): MissionTemplate | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** Assign a mission. Mutates the draft. Returns an error message or null. */
export function assignMission(s: GameState, workerId: string, templateId: string, rng: () => number): string | null {
  const t = missionTemplate(templateId);
  const w = s.workers.find((x) => x.id === workerId);
  if (!t || !w) return "Unknown mission or worker.";
  if (s.missions.some((m) => m.workerId === workerId && m.status === "active")) return `${w.name} already has a mission.`;
  const m: Mission = {
    id: nextId(s, "ms"),
    templateId: t.id,
    workerId,
    title: t.title,
    start: t.metric(s),
    target: t.target(s),
    progress: 0,
    reward: t.reward,
    deadline: s.minutes + t.days * 24 * 60,
    status: "active",
  };
  s.missions = [...s.missions, m];
  w.focus = t.focus;
  w.homeRoom = FOCUS_ROOM[t.focus];
  w.task = t.title;
  w.taskProgress = 0;
  say(s, w.id, line(w.id, "missionStart", rng));
  log(s, `${w.name} took on a mission: ${t.title}.`, "info");
  return null;
}

/** Update mission progress, pay rewards and fail overdue missions. */
export function runMissions(s: GameState, rng: () => number): void {
  for (const m of s.missions) {
    if (m.status !== "active") continue;
    const t = missionTemplate(m.templateId);
    const w = s.workers.find((x) => x.id === m.workerId);
    if (!t || !w) {
      m.status = "failed";
      continue;
    }
    m.progress = Math.max(0, t.metric(s) - m.start);
    w.taskProgress = clamp((m.progress / Math.max(1, m.target)) * 100);
    if (m.progress >= m.target) {
      m.status = "done";
      otherIncome(s, m.reward);
      w.mood = clamp(w.mood + 10);
      w.loyalty = clamp(w.loyalty + 5);
      say(s, w.id, line(w.id, "missionDone", rng));
      log(s, `Mission complete: ${m.title} (+$${m.reward}).`, "good");
    } else if (s.minutes >= m.deadline) {
      m.status = "failed";
      w.mood = clamp(w.mood - 5);
      say(s, w.id, line(w.id, "missionFailed", rng));
      log(s, `Mission failed: ${m.title}.`, "bad");
    }
  }
  // Keep only recent finished missions.
  const finished = s.missions.filter((m) => m.status !== "active");
  if (finished.length > 10) {
    const drop = new Set(finished.slice(0, finished.length - 10).map((m) => m.id));
    s.missions = s.missions.filter((m) => !drop.has(m.id));
  }
}
