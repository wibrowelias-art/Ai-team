/** Generated 16x16 pixel mockups for factory products. Deterministic per product seed. */
import type { ProductType } from "@/game/types";

export const MOCKUP_SIZE = 16;

const MAIN = ["#ff2bd6", "#22e6ff", "#ffd84a", "#39ff88", "#9b5cff", "#ff9a3c", "#f4f4ff", "#2b2b44"];
const ACCENT = ["#14101c", "#f4f4ff", "#ff2bd6", "#22e6ff", "#ffd84a"];

function rngFrom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 10000) / 10000;
  };
}

const TSHIRT = [
  "................",
  "....KKKKKKKK....",
  "..KKAAAKKAAAKK..",
  ".KAAAAAAAAAAAAK.",
  "KAAAAAAAAAAAAAAK",
  "KAAAKAAAAAAKAAAK",
  ".KKKKAAAAAAKKKK.",
  "....KA....AK....",
  "....KA....AK....",
  "....KA....AK....",
  "....KA....AK....",
  "....KAAAAAAK....",
  "....KAAAAAAK....",
  "....KAAAAAAK....",
  "....KKKKKKKK....",
  "................",
];

const CANDLE = [
  "................",
  ".......F........",
  "......FYF.......",
  "......FYF.......",
  ".......K........",
  "....KKKKKKKK....",
  "....KWWWWWWK....",
  "...KAAAAAAAAK...",
  "...KAAAAAAAAK...",
  "...KAWWWWWWAK...",
  "...KAW....WAK...",
  "...KAWWWWWWAK...",
  "...KAAAAAAAAK...",
  "...KAAAAAAAAK...",
  "....KKKKKKKK....",
  "................",
];

/** Returns a 16x16 grid of CSS colors (or null for transparent). */
export function mockupPixels(type: ProductType, seed: number): (string | null)[][] {
  const r = rngFrom(seed + 7);
  const main = MAIN[Math.floor(r() * MAIN.length)];
  let accent = ACCENT[Math.floor(r() * ACCENT.length)];
  if (accent === main) accent = "#14101c";
  const K = "#0a0a12";
  const grid: (string | null)[][] = Array.from({ length: MOCKUP_SIZE }, () => Array<string | null>(MOCKUP_SIZE).fill(null));
  const fromTemplate = (rows: string[], map: Record<string, string>) => {
    rows.forEach((row, y) => [...row].forEach((c, x) => (grid[y][x] = map[c] ?? null)));
  };

  switch (type) {
    case "tshirt": {
      fromTemplate(TSHIRT, { K, A: main });
      // 4x4 symmetric print in the chest area (columns 6-9, rows 7-10)
      for (let y = 7; y <= 10; y++) {
        for (let x = 0; x < 2; x++) {
          const c = r() < 0.55 ? accent : main;
          grid[y][6 + x] = c;
          grid[y][9 - x] = c;
        }
      }
      break;
    }
    case "candle": {
      fromTemplate(CANDLE, { K, A: main, W: "#e8e0f0", F: "#ff9a3c", Y: "#ffd84a" });
      for (let x = 6; x <= 9; x++) grid[10][x] = r() < 0.6 ? accent : "#e8e0f0";
      break;
    }
    case "poster": {
      for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) grid[y][x] = y === 1 || y === 14 || x === 2 || x === 13 ? "#3a3450" : main;
      // sun + horizon lines
      const cy = 5 + Math.floor(r() * 3);
      for (let y = 3; y < 14; y++) {
        for (let x = 3; x < 13; x++) {
          const d = Math.hypot(x - 7.5, y - cy);
          if (d < 3) grid[y][x] = accent;
          if (y > cy + 2 && (y - cy) % 2 === 0) grid[y][x] = "#14101c";
        }
      }
      break;
    }
    case "song": {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const d = Math.hypot(x - 7.5, y - 7.5);
          if (d < 7.5) grid[y][x] = d < 2.5 ? main : d < 3.2 ? accent : Math.floor(d) % 2 === 0 ? "#1a1824" : "#0f0e16";
          if (d < 0.8) grid[y][x] = "#0a0a12";
        }
      }
      grid[4][11] = "#5a5670";
      grid[5][12] = "#5a5670";
      break;
    }
    case "video": {
      for (let y = 2; y < 14; y++) for (let x = 0; x < 16; x++) grid[y][x] = y === 2 || y === 13 || x === 0 || x === 15 ? "#2a2a3a" : main;
      // play triangle
      for (let i = 0; i < 4; i++) for (let y = 5 + i; y <= 10 - i; y++) grid[y][6 + i] = "#f4f4ff";
      for (let x = 1; x < 15; x++) grid[12][x] = x < 4 + Math.floor(r() * 8) ? accent : "#14101c";
      break;
    }
  }
  return grid;
}
