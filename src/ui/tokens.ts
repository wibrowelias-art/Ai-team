/**
 * Design tokens. The CSS variables in app/globals.css mirror these; canvas code imports them.
 * Neon is for accents, numbers and highlights only. Surfaces stay dark and calm.
 */
export const T = {
  bg: "#07070d",
  surface: "#11111b",
  raised: "#191926",
  border: "#2a2a3d",
  pink: "#ff2bd6",
  cyan: "#22e6ff",
  purple: "#9b5cff",
  yellow: "#ffd84a",
  green: "#39ff88",
  red: "#ff4d6a",
  orange: "#ff9a3c",
  text: "#f2f2ff",
  text2: "#a0a0c0",
  muted: "#6a6a88",
} as const;

export type Neon = "pink" | "cyan" | "purple" | "yellow" | "green" | "red" | "orange";

/** Spacing scale in px: 4, 8, 12, 16, 24, 32. */
export const SPACE = [4, 8, 12, 16, 24, 32] as const;
export const RADIUS = { panel: 12, button: 10, chip: 8 } as const;
/** Type scale in px. */
export const TYPE = { xs: 11, sm: 13, md: 15, lg: 18, xl: 24 } as const;

/** Spring used for panels and buttons (stiffness 300, damping 30). */
export const SPRING = { stiffness: 300, damping: 30 } as const;

/** rgba() helper for a hex token. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
