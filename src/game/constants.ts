/** Shared palette and world geometry. All world sizes are in art pixels. */

export const COLORS = {
  bg: "#0a0a12",
  bg2: "#12101f",
  panel: "#16161f",
  pink: "#ff2bd6",
  purple: "#9b5cff",
  cyan: "#22e6ff",
  yellow: "#ffd84a",
  green: "#39ff88",
  red: "#ff4d6d",
  orange: "#ff9a3c",
  white: "#f4f4ff",
} as const;

export type ThemeId = "pink" | "cyan" | "purple";

export const THEMES: Record<ThemeId, { label: string; trim: string; trimDark: string; wall: string }> = {
  pink: { label: "Pink", trim: COLORS.pink, trimDark: "#5a1150", wall: "#1a1226" },
  cyan: { label: "Cyan", trim: COLORS.cyan, trimDark: "#0b4452", wall: "#101a26" },
  purple: { label: "Purple", trim: COLORS.purple, trimDark: "#33205e", wall: "#161226" },
};

/** World layout (art pixels). Floor 0 is the top floor. */
export const WORLD_W = 260;
export const BUILDING_X = 10;
export const BUILDING_W = 240;
export const ROOF_H = 104; // sky + roof sign above the first floor
export const FLOOR_H = 56; // slab + interior
export const SLAB_H = 6;
export const GROUND_H = 190;

/** Columns on each floor. Column 0 | elevator shaft | column 1 | column 2. */
export const COLUMNS = [
  { x: 12, w: 72 },
  { x: 106, w: 72 },
  { x: 178, w: 70 },
] as const;
export const SHAFT = { x: 85, w: 20 } as const;
export const SHAFT_CENTER_X = SHAFT.x + SHAFT.w / 2;

/** Worker sprite size. */
export const SPRITE_W = 12;
export const SPRITE_H = 16;

/** Time: 1 real second at 1x = 1 game minute. 1 cycle = 60 game minutes. */
export const GAME_MIN_PER_REAL_SEC = 1;
export const MINUTES_PER_CYCLE = 60;
export const CYCLES_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_CYCLE * CYCLES_PER_DAY;
export const START_MINUTE = 8 * 60; // day 1, 08:00

/** Movement speeds per game minute. */
export const WALK_SPEED = 22; // px / game minute
export const ELEVATOR_SPEED = 40; // px / game minute

export const START_CASH = 5000;
export const SAVE_VERSION = 1;
export const SPEEDS = [0, 1, 2, 5] as const;
export type Speed = (typeof SPEEDS)[number];
