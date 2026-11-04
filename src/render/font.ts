/** Tiny 3x5 bitmap font for in-world neon signs. Each glyph is 5 rows of 3 columns. */
const GLYPHS: Record<string, string> = {
  A: "###|#.#|###|#.#|#.#",
  B: "##.|#.#|##.|#.#|##.",
  C: "###|#..|#..|#..|###",
  D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###",
  F: "###|#..|##.|#..|#..",
  G: "###|#..|#.#|#.#|###",
  H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###",
  J: "..#|..#|..#|#.#|###",
  K: "#.#|#.#|##.|#.#|#.#",
  L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#",
  N: "##.|#.#|#.#|#.#|#.#",
  O: "###|#.#|#.#|#.#|###",
  P: "###|#.#|###|#..|#..",
  Q: "###|#.#|#.#|###|..#",
  R: "##.|#.#|##.|#.#|#.#",
  S: "###|#..|###|..#|###",
  T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###",
  V: "#.#|#.#|#.#|#.#|.#.",
  W: "#.#|#.#|###|###|#.#",
  X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.",
  Z: "###|..#|.#.|#..|###",
  "0": "###|#.#|#.#|#.#|###",
  "1": ".#.|##.|.#.|.#.|###",
  "2": "###|..#|###|#..|###",
  "3": "###|..#|.##|..#|###",
  "4": "#.#|#.#|###|..#|..#",
  "5": "###|#..|###|..#|###",
  "6": "###|#..|###|#.#|###",
  "7": "###|..#|..#|.#.|.#.",
  "8": "###|#.#|###|#.#|###",
  "9": "###|#.#|###|..#|###",
  "/": "..#|..#|.#.|#..|#..",
  "$": ".#.|###|##.|.##|###",
  "-": "...|...|###|...|...",
  ".": "...|...|...|...|.#.",
  ":": "...|.#.|...|.#.|...",
  "!": ".#.|.#.|.#.|...|.#.",
  "'": ".#.|.#.|...|...|...",
  "&": ".#.|#.#|.#.|#.#|.##",
  " ": "...|...|...|...|...",
};

const PARSED: Record<string, boolean[][]> = {};
for (const [ch, g] of Object.entries(GLYPHS)) {
  PARSED[ch] = g.split("|").map((row) => [...row].map((c) => c === "#"));
}

export const GLYPH_W = 3;
export const GLYPH_H = 5;

export function glyph(ch: string): boolean[][] {
  return PARSED[ch.toUpperCase()] ?? PARSED[" "];
}

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * (GLYPH_W + 1) - 1) * scale;
}

/** Draw pixel text with its top-left at (x, y). */
export function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of text) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < GLYPH_W; c++) {
        if (g[r][c]) ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
}

export function hasGlyph(ch: string): boolean {
  return ch.toUpperCase() in PARSED;
}
