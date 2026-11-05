/**
 * Worker sprites are composed from small character grids (12x16) so every crew member
 * gets a unique, original pixel-art look without any external assets.
 *
 * Keys: . transparent, H hair, S skin, s skin shade, E eye, O outfit, o outfit shade,
 * P pants, B shoes, A accent, K dark, W white, L lens, M metal, m metal shade, V visor.
 * In overlays "." keeps the pixel below and "_" clears it.
 */
import type { Accessory, HairStyle, WorkerLook } from "@/game/types";

export const FRAME_W = 12;
export const FRAME_H = 16;

type Grid = string[];

const HEAD: Grid = [
  "....HHHH....",
  "...HHHHHH...",
  "...HHSSSS...",
  "...HSSESE...",
  "...SSSSSS...",
  "....SSSS....",
  ".....ss.....",
];

const TORSO: Grid = [
  "...oOOOOo...",
  "..oOOOOOOo..",
  "..oOOOOOOo..",
  "..SoOOOOoS..",
  "...PPPPPP...",
];

const TORSO_TYPE_A: Grid = [
  "...oOOOOo...",
  "..oOOOOOOo..",
  "..oOOOOOOOSS",
  "...oOOOOo...",
  "...PPPPPP...",
];

const TORSO_TYPE_B: Grid = [
  "...oOOOOo...",
  "..oOOOOOOo..",
  "..oOOOOOOo..",
  "...oOOOOOOSS",
  "...PPPPPP...",
];

const LEGS_STAND: Grid = ["...PP..PP...", "...PP..PP...", "...PP..PP...", "...BBB.BBB.."];
const LEGS_STRIDE: Grid = ["..PP....PP..", "..PP....PP..", ".PP......PP.", ".BBB.....BBB"];
const LEGS_PASS: Grid = ["....PPPP....", "....PP.PP...", "....PP..PP..", "....BBB.BBB."];
const LEGS_SIT: Grid = ["...PPPPPPP..", "........PP..", "........BBB."];
/** Half stride, between the pass and the full stride. */
const LEGS_HALF: Grid = ["...PP...PP..", "...PP...PP..", "..PP.....PP.", "..BBB...BBB."];

const HAIR: Record<HairStyle, Grid> = {
  short: [],
  long: ["", "", "", "", "...H........", "...H........", "...HH......."],
  spiky: ["...H.HH.H...", "..HHHHHHHH.."],
  bald: ["....____....", "...SSSSSS...", "...sSSSSS...", "...sSSESE..."],
  mohawk: ["....__HH....", "...sSHHHs...", "...sSSSSS...", "...sSSESE..."],
  bun: ["..HH........", "..H........."],
};

const ACCESSORY: Record<Accessory, Grid> = {
  none: [],
  cap: ["....AAAA....", "...AAAAAAA.."],
  beanie: ["...AAAAA....", "...AAAAAA..."],
  headphones: ["...KKKKKK...", "...K........", "....AA......", "....AA......"],
  glasses: ["", "", "", ".....GLGL..."],
  shades: ["", "", "", ".....KKKKK.."],
  skull: ["", "", "...HWWWWW...", "...HWKWKW...", "...WWWWWW...", "....WKWK...."],
  robot: ["......A.....", "...MMMMMM...", "...MMMMMM...", "...MVVVVV...", "...MMMMMM...", "....MMMM....", ".....mm....."],
};

function overlay(base: Grid, over: Grid, rowOffset = 0): Grid {
  const out = base.slice();
  over.forEach((row, i) => {
    const r = i + rowOffset;
    if (!row || r < 0 || r >= out.length) return;
    const chars = [...out[r]];
    [...row].forEach((c, col) => {
      if (c === ".") return;
      chars[col] = c === "_" ? "." : c;
    });
    out[r] = chars.join("");
  });
  return out;
}

function shift(grid: Grid, dy: number): Grid {
  const blank = ".".repeat(FRAME_W);
  if (dy === 0) return grid;
  if (dy < 0) return [...grid.slice(-dy), ...Array(-dy).fill(blank)];
  return [...Array(dy).fill(blank), ...grid.slice(0, grid.length - dy)];
}

function head(look: Pick<WorkerLook, "hairStyle" | "accessory">, blink: boolean): Grid {
  let h = overlay(HEAD, HAIR[look.hairStyle]);
  if (blink) h = overlay(h, ["", "", "", "......s.s..."]);
  h = overlay(h, ACCESSORY[look.accessory]);
  return h;
}

export type FrameName =
  | "idle0"
  | "idle1"
  | "walk0"
  | "walk1"
  | "walk2"
  | "walk3"
  | "type0"
  | "type1"
  | "cheer0"
  | "cheer1"
  | "walk4"
  | "walk5"
  | "stretch"
  | "stomp";

export const FRAME_NAMES: FrameName[] = ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3", "type0", "type1", "cheer0", "cheer1", "walk4", "walk5", "stretch", "stomp"];
/** 6-frame walk cycle: stride, half, pass, stride (mirrored legs read the same), half, stand-bob. */
export const WALK_CYCLE: FrameName[] = ["walk0", "walk4", "walk2", "walk0", "walk5", "walk1"];

const ARMS_UP: Grid = ["", "..S......S..", "..o......o..", "..o......o..", "..o......o..", "..o......o..", "..o......o.."];

/** Compose a 12x16 character grid for one animation frame. */
export function composeFrame(look: Pick<WorkerLook, "hairStyle" | "accessory">, frame: FrameName): Grid {
  const blank = ".".repeat(FRAME_W);
  switch (frame) {
    case "idle0":
    case "idle1":
      return [...head(look, frame === "idle1"), ...TORSO, ...LEGS_STAND];
    case "walk0":
    case "walk2":
      return [...head(look, false), ...TORSO, ...(frame === "walk0" ? LEGS_STRIDE : LEGS_PASS)];
    case "walk1":
    case "walk3":
      return shift([...head(look, false), ...TORSO, ...LEGS_STAND], -1);
    case "walk4":
      return [...head(look, false), ...TORSO, ...LEGS_HALF];
    case "walk5":
      return shift([...head(look, false), ...TORSO, ...LEGS_HALF], -1);
    case "stretch": {
      // arms up, on tiptoe
      const body = overlay([...head(look, false), ...TORSO, ...LEGS_STAND], ARMS_UP);
      return shift(overlay(body, ["", "", "", "", "", "", "", "", "", "", ".._......_.."]), -1);
    }
    case "stomp":
      // knees bent, body one pixel lower
      return shift([...head(look, false), ...TORSO, ...LEGS_STAND], 1);
    case "type0":
    case "type1": {
      const torso = frame === "type0" ? TORSO_TYPE_A : TORSO_TYPE_B;
      return [blank, ...head(look, false), ...torso, ...LEGS_SIT];
    }
    case "cheer0":
    case "cheer1": {
      const body = overlay([...head(look, false), ...TORSO, ...LEGS_STAND], ARMS_UP);
      const fixed = overlay(body, ["", "", "", "", "", "", "", "", "", "", ".._......_.."]);
      return frame === "cheer1" ? shift(fixed, -1) : fixed;
    }
  }
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function paletteFor(look: WorkerLook): Record<string, string> {
  return {
    H: look.hair,
    S: look.skin,
    s: shade(look.skin, -0.2),
    E: "#14101c",
    O: look.outfit,
    o: shade(look.outfit, -0.3),
    P: look.pants,
    B: "#0e0e16",
    A: look.accent,
    K: "#24242e",
    W: "#f4f4ff",
    G: "#24242e",
    L: "#bfefff",
    M: "#9aa3b5",
    m: "#6c7488",
    V: "#22e6ff",
  };
}

/** Paint a grid onto a canvas context at (x, y); optionally mirrored horizontally. */
export function paintGrid(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  palette: Record<string, string>,
  x: number,
  y: number,
  flip = false,
): void {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + (flip ? row.length - 1 - c : c), y + r, 1, 1);
    }
  }
}
