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

/** World layout (art pixels). Floor 0 is the top floor. The city fills CITY_MARGIN on each side. */
export const CITY_MARGIN = 240;
export const ROOM_W = 64;
export const SHAFT_W = 20;
export const BUILDING_X = CITY_MARGIN;
export const BUILDING_W = 4 * ROOM_W + SHAFT_W + 4; // 2px outer walls
export const WORLD_W = BUILDING_X * 2 + BUILDING_W;
export const ROOF_H = 104; // sky + roof sign above the first floor
export const FLOOR_H = 56; // slab + interior
export const SLAB_H = 6;
export const GROUND_H = 190;
/** Rooms per floor. */
export const COLS = 4;

const IN = BUILDING_X + 2;
/** Columns on each floor: col 0 | col 1 | elevator shaft | col 2 | col 3. */
export const COLUMNS = [
  { x: IN, w: ROOM_W },
  { x: IN + ROOM_W, w: ROOM_W },
  { x: IN + 2 * ROOM_W + SHAFT_W, w: ROOM_W },
  { x: IN + 3 * ROOM_W + SHAFT_W, w: ROOM_W },
] as const;
export const SHAFT = { x: IN + 2 * ROOM_W, w: SHAFT_W } as const;
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
export const SAVE_VERSION = 3;
export const SPEEDS = [0, 1, 2, 5] as const;
export type Speed = (typeof SPEEDS)[number];

/** Economy tuning. Money is fictional in-game currency. */
export const RENT_PER_FLOOR = 150; // per day
export const COMPUTE_PER_WORKER = 2; // per cycle
export const OFFLINE_CAP_MINUTES = 3 * 24 * 60; // simulate at most 3 game days
export const DEFAULT_BUDGET = 50; // per business per day
export const MAX_BUDGET = 500;
