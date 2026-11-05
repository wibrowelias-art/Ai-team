/** "While you were away": simulate the time the tab was closed. */
import { GAME_MIN_PER_REAL_SEC, OFFLINE_CAP_MINUTES } from "./constants";
import { step, type Rng } from "./sim";
import type { GameState } from "./types";

export interface AwaySummary {
  realMs: number;
  gameMinutes: number;
  capped: boolean;
  cashBefore: number;
  cashAfter: number;
  revenue: number;
  spent: number;
  otherIncome: number;
  productsLaunched: number;
  events: string[];
  leftCrew: string[];
  daysPassed: number;
}

/** Below this many game minutes we just continue without a summary. */
export const MIN_AWAY_MINUTES = 5;

/**
 * Simulate the missed time. The world runs at 1x while away (or not at all if the game was paused),
 * capped at 3 game days. Events resolve with their default choice and products auto-approve.
 */
export function applyOffline(game: GameState, nowMs: number, rng: Rng = Math.random): { game: GameState; summary: AwaySummary | null } {
  const realMs = Math.max(0, nowMs - game.savedAt);
  if (game.settings.speed === 0) return { game, summary: null };
  const wanted = (realMs / 1000) * GAME_MIN_PER_REAL_SEC;
  if (wanted < MIN_AWAY_MINUTES) return { game, summary: null };
  const gameMinutes = Math.min(wanted, OFFLINE_CAP_MINUTES);

  const logBefore = game.log.length;
  const launchedBefore = Object.values(game.economy.launched).reduce((a, b) => a + b, 0);
  const after = step(game, gameMinutes, rng, { offline: true });
  const launchedAfter = Object.values(after.economy.launched).reduce((a, b) => a + b, 0);

  // New log lines since the save (the log is capped, so fall back to time filtering).
  const newLines = after.log.length >= logBefore ? after.log.filter((l) => l.t > game.minutes) : [];
  const events = newLines.filter((l) => l.text.startsWith("⚡ ")).map((l) => l.text.slice(2));
  const leftCrew = game.workers.filter((w) => !after.workers.some((x) => x.id === w.id)).map((w) => w.name);

  return {
    game: { ...after, savedAt: nowMs },
    summary: {
      realMs,
      gameMinutes,
      capped: wanted > OFFLINE_CAP_MINUTES,
      cashBefore: game.cash,
      cashAfter: after.cash,
      revenue: after.totalRevenue - game.totalRevenue,
      spent: after.totalSpent - game.totalSpent,
      otherIncome: after.economy.otherIncome - game.economy.otherIncome,
      productsLaunched: launchedAfter - launchedBefore,
      events,
      leftCrew,
      daysPassed: Math.floor(after.minutes / 1440) - Math.floor(game.minutes / 1440),
    },
  };
}
