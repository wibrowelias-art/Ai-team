/** Company milestones: a visible track in the Command room, each with a cash reward and a celebration. */
import { clamp, draftOf, log, otherIncome } from "./draft";
import type { GameState } from "./types";

export interface Milestone {
  id: string;
  title: string;
  detail: string;
  reward: number;
  /** 0..1 */
  progress: (s: GameState) => number;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export const MILESTONES: Milestone[] = [
  { id: "rev_1k", title: "First $1,000", detail: "Earn $1,000 in revenue.", reward: 200, progress: (s) => s.totalRevenue / 1000 },
  { id: "ship_1", title: "First launch", detail: "Ship a product the crew designed.", reward: 150, progress: (s) => Math.max(0, Object.values(s.economy.launched).reduce((a, b) => a + b, 0) - 2) },
  { id: "meet_1", title: "First meeting", detail: "Call the crew into the War Room.", reward: 300, progress: (s) => s.meetings.length },
  { id: "rev_10k", title: "$10K club", detail: "Earn $10,000 in revenue.", reward: 1000, progress: (s) => s.totalRevenue / 10_000 },
  { id: "crew_10", title: "Crew of 10", detail: "Grow the team to 10 people.", reward: 1500, progress: (s) => s.workers.length / 10 },
  { id: "viral_1", title: "Going viral", detail: "Have something blow up online.", reward: 800, progress: (s) => s.milestones.virals },
  { id: "floors_5", title: "Five floors", detail: "Build the tower up to 5 floors.", reward: 2500, progress: (s) => s.building.floors / 5 },
  { id: "fans_10k", title: "10K fans", detail: "Reach 10,000 music fans.", reward: 2000, progress: (s) => s.economy.businesses.music.fans / 10_000 },
  { id: "rev_100k", title: "$100K", detail: "Earn $100,000 in revenue.", reward: 5000, progress: (s) => s.totalRevenue / 100_000 },
  { id: "rev_1m", title: "Unicorn-ish", detail: "Earn $1,000,000 in revenue.", reward: 25_000, progress: (s) => s.totalRevenue / 1_000_000 },
];

export function milestoneById(id: string): Milestone | undefined {
  return MILESTONES.find((m) => m.id === id);
}

/** Milestones that are reached but not booked yet. */
export function newlyReached(s: GameState): Milestone[] {
  return MILESTONES.filter((m) => !s.milestones.done.includes(m.id) && m.progress(s) >= 1);
}

/** Book reached milestones on a draft: reward, log line, a mood bump for everyone. */
export function bookMilestones(s: GameState): Milestone[] {
  const reached = newlyReached(s);
  if (reached.length === 0) return reached;
  s.milestones = { ...s.milestones, done: [...s.milestones.done, ...reached.map((m) => m.id)], unseen: [...s.milestones.unseen, ...reached.map((m) => m.id)] };
  for (const m of reached) {
    otherIncome(s, m.reward);
    log(s, `🏆 Milestone: ${m.title}. +${money(m.reward)} bonus.`, "good");
  }
  for (const w of s.workers) w.mood = clamp(w.mood + 3);
  return reached;
}

/** Pure wrapper for player actions: returns the same state when nothing new was reached. */
export function withMilestones(state: GameState): GameState {
  if (newlyReached(state).length === 0) return state;
  const s = draftOf(state);
  bookMilestones(s);
  return s;
}
