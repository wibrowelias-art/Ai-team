/**
 * Static scene, drawn once per layout change: the near city, the street, the underground,
 * and HQ with 2.5D room interiors. Three layers are painted together:
 *  - ctx:   color (pixel art)
 *  - ectx:  emissive (feeds the bloom)
 *  - light: soft light pools (half resolution, drawn in world coordinates)
 * The sky and the distant skyline are drawn behind this at runtime (parallax).
 */
import { floorBase, floorTop, Rect, ROOM_DEFS, roomRect, shaftRect, worldHeight } from "@/game/building";
import { BUILDING_W, BUILDING_X, COLORS, COLUMNS, SHAFT, SHAFT_CENTER_X, SLAB_H, THEMES, WORLD_W } from "@/game/constants";
import { mulberry32 } from "@/game/sim";
import type { GameState, RoomSlot, Spot } from "@/game/types";
import { drawNearCity, hexA, softLight, type Blinker } from "./city";

type Ctx = CanvasRenderingContext2D;

/** Room box depth: side walls, ceiling and floor bands, in art pixels. */
export const DEPTH = 5;
export const CEIL = 4;
export const FLOOR_D = 8;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Paint on both the color layer and the emissive (bloom) layer. */
function glow(ctx: Ctx, ectx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x, y, w, h, color);
  rect(ectx, x, y, w, h, color);
}

function mix(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function dim(hex: string): string {
  return mix(hex, 0.45);
}

export function staticKey(g: GameState): string {
  return [g.company.name, g.company.theme, g.building.floors, ...g.building.rooms.map((r) => `${r.id}:${r.type}:${r.locked}:${r.level}`)].join("|");
}

export function groundLine(floors: number): number {
  return floorTop(floors) + SLAB_H;
}

/** Car lanes (y of the wheels). */
export function laneY(floors: number): [number, number] {
  const gy = groundLine(floors);
  return [gy + 12, gy + 20];
}

/** Subway tunnel band. */
export function tunnelY(floors: number): { y0: number; y1: number } {
  const gy = groundLine(floors);
  return { y0: gy + 58, y1: gy + 84 };
}

export interface StaticResult {
  blinkers: Blinker[];
}

export function drawStatic(ctx: Ctx, ectx: Ctx, light: Ctx, g: GameState): StaticResult {
  const theme = THEMES[g.company.theme];
  const H = worldHeight(g.building.floors);
  const groundY = groundLine(g.building.floors);
  const rng = mulberry32(1337);

  ctx.clearRect(0, 0, WORLD_W, H);

  const blinkers = drawNearCity(ctx, ectx, light, groundY);
  drawStreet(ctx, ectx, light, groundY, H, rng);
  drawRoof(ctx, ectx, light, theme.trim, blinkers);

  // ---- HQ shell
  const top = floorTop(0);
  const shellH = groundY - top;
  rect(ctx, BUILDING_X, top, BUILDING_W, shellH, "#1c1828");
  drawShaft(ctx, ectx, light, g.building.floors);
  for (const slot of g.building.rooms) drawRoom(ctx, ectx, light, slot, theme.wall);
  drawPillars(ctx, g.building.floors);
  drawSlabs(ctx, ectx, theme.trim, g.building.floors);

  // Outer walls with vertical neon strips
  for (const wx of [BUILDING_X, BUILDING_X + BUILDING_W - 3]) {
    rect(ctx, wx, top, 3, shellH, "#2c2640");
    rect(ctx, wx + (wx === BUILDING_X ? 0 : 2), top, 1, shellH, "#3e3658");
  }
  glow(ctx, ectx, BUILDING_X - 1, top, 1, shellH, theme.trim);
  glow(ctx, ectx, BUILDING_X + BUILDING_W, top, 1, shellH, theme.trim);
  glow(ctx, ectx, BUILDING_X - 1, top - 1, BUILDING_W + 2, 1, theme.trim);
  softLight(light, BUILDING_X, top + shellH / 2, 60, theme.trim, 0.18);
  softLight(light, BUILDING_X + BUILDING_W, top + shellH / 2, 60, theme.trim, 0.18);

  // Entrance canopy on the left, at street level
  const ex = BUILDING_X - 18;
  rect(ctx, ex, groundY - 17, 18, 2, "#2c2640");
  glow(ctx, ectx, ex, groundY - 15, 18, 1, theme.trim);
  rect(ctx, ex + 1, groundY - 15, 1, 15, "#3a3450");
  softLight(light, ex + 9, groundY - 6, 24, theme.trim, 0.45);
  return { blinkers };
}

// ---------------------------------------------------------------- street & underground

function drawStreet(ctx: Ctx, ectx: Ctx, light: Ctx, groundY: number, H: number, rng: () => number): void {
  // underground strata
  const strata = ["#120d18", "#100b15", "#0d0912", "#0b0810", "#09070d"];
  const band = Math.ceil((H - groundY) / strata.length);
  strata.forEach((c, i) => rect(ctx, 0, groundY + i * band, WORLD_W, band, c));
  for (let i = 0; i < 520; i++) {
    const px = Math.floor(rng() * WORLD_W);
    const py = groundY + 26 + Math.floor(rng() * (H - groundY - 28));
    rect(ctx, px, py, 1 + Math.floor(rng() * 3), 1, rng() < 0.5 ? "#1a1322" : "#22192c");
  }

  // sidewalk, curb, road
  rect(ctx, 0, groundY, WORLD_W, 4, "#2a2636");
  rect(ctx, 0, groundY, WORLD_W, 1, "#3e3856");
  for (let x = 0; x < WORLD_W; x += 8) rect(ctx, x, groundY + 1, 1, 3, "#221e2e");
  rect(ctx, 0, groundY + 4, WORLD_W, 1, "#4a4460");
  rect(ctx, 0, groundY + 5, WORLD_W, 17, "#121019");
  for (let i = 0; i < 400; i++) rect(ctx, Math.floor(rng() * WORLD_W), groundY + 5 + Math.floor(rng() * 17), 1, 1, rng() < 0.5 ? "#17141f" : "#0e0c14");
  for (let x = 4; x < WORLD_W; x += 16) rect(ctx, x, groundY + 13, 8, 1, "#5a5022");
  // crosswalk in front of HQ
  for (let x = BUILDING_X + BUILDING_W / 2 - 20; x < BUILDING_X + BUILDING_W / 2 + 20; x += 4) rect(ctx, x, groundY + 6, 2, 15, "#2e2a3a");
  rect(ctx, 0, groundY + 22, WORLD_W, 2, "#2a2636");

  // streetlights (skip the HQ front)
  for (let x = 30; x < WORLD_W; x += 72) {
    if (x > BUILDING_X - 6 && x < BUILDING_X + BUILDING_W + 6) continue;
    rect(ctx, x, groundY - 30, 1, 31, "#4a4460");
    rect(ctx, x, groundY - 30, 5, 1, "#4a4460");
    glow(ctx, ectx, x + 3, groundY - 29, 3, 1, "#ffe2a8");
    softLight(light, x + 4, groundY - 18, 26, "#ffcf8a", 0.42);
    softLight(light, x + 4, groundY + 8, 18, "#ffcf8a", 0.22);
  }

  // pipes
  for (const p of [
    { y: groundY + 34, c: "#0f5966" },
    { y: groundY + 46, c: "#5a1650" },
  ]) {
    rect(ctx, 0, p.y, WORLD_W, 3, "#121a26");
    glow(ctx, ectx, 0, p.y + 1, WORLD_W, 1, p.c);
    for (let jx = 6; jx < WORLD_W; jx += 40) rect(ctx, jx, p.y - 1, 3, 5, "#1c2636");
  }

  // subway tunnel
  const t0 = groundY + 58;
  rect(ctx, 0, t0, WORLD_W, 26, "#0a0a12");
  rect(ctx, 0, t0, WORLD_W, 1, "#2a2440");
  rect(ctx, 0, t0 + 25, WORLD_W, 1, "#2a2440");
  rect(ctx, 0, t0 + 22, WORLD_W, 1, "#3a3450");
  for (let x = 0; x < WORLD_W; x += 6) rect(ctx, x, t0 + 23, 3, 1, "#1e1a2a");
  for (let x = 20; x < WORLD_W; x += 48) {
    glow(ctx, ectx, x, t0 + 2, 4, 1, "#7ae0ff");
    softLight(light, x + 2, t0 + 8, 14, "#7ae0ff", 0.3);
  }
  // foundation under HQ
  rect(ctx, BUILDING_X + 6, groundY + 24, BUILDING_W - 12, 6, "#17131f");
  rect(ctx, BUILDING_X + 6, groundY + 30, 2, 26, "#141019");
  rect(ctx, BUILDING_X + BUILDING_W - 8, groundY + 30, 2, 26, "#141019");
}

// ---------------------------------------------------------------- HQ structure

function drawRoof(ctx: Ctx, ectx: Ctx, light: Ctx, trim: string, blinkers: Blinker[]): void {
  const top = floorTop(0);
  rect(ctx, BUILDING_X, top - 4, BUILDING_W, 4, "#221d30");
  rect(ctx, BUILDING_X, top - 4, BUILDING_W, 1, "#3a3450");
  // AC units
  for (const [x, w] of [
    [BUILDING_X + 8, 16],
    [BUILDING_X + 28, 10],
  ]) {
    rect(ctx, x, top - 11, w, 7, "#2a2538");
    for (let k = 1; k < w - 1; k += 2) rect(ctx, x + k, top - 9, 1, 3, "#3a3450");
  }
  // water tank
  const tx = BUILDING_X + BUILDING_W - 46;
  rect(ctx, tx, top - 22, 16, 12, "#2a2232");
  rect(ctx, tx, top - 23, 16, 1, "#3a3048");
  for (let k = 0; k < 16; k += 4) rect(ctx, tx + k, top - 21, 1, 11, "#221a2a");
  rect(ctx, tx + 2, top - 10, 1, 6, "#2a2232");
  rect(ctx, tx + 13, top - 10, 1, 6, "#2a2232");
  // antenna
  const ax = BUILDING_X + BUILDING_W - 14;
  rect(ctx, ax, top - 40, 1, 36, "#4a4560");
  rect(ctx, ax - 3, top - 28, 7, 1, "#4a4560");
  rect(ctx, ax - 2, top - 20, 5, 1, "#4a4560");
  blinkers.push({ x: ax, y: top - 41, color: COLORS.red, period: 1200, phase: 0 });
  // roof edge uplight
  softLight(light, BUILDING_X + BUILDING_W / 2, top - 6, 80, trim, 0.2);
  glow(ctx, ectx, BUILDING_X + 2, top - 4, BUILDING_W - 4, 1, mix(trim, 0.5));
}

function drawShaft(ctx: Ctx, ectx: Ctx, light: Ctx, floors: number): void {
  const sh = shaftRect(floors);
  rect(ctx, sh.x, sh.y, sh.w, sh.h, "#08101a");
  // depth: darker sides, lighter center column
  rect(ctx, sh.x + 2, sh.y, sh.w - 4, sh.h, "#0b1622");
  rect(ctx, sh.x + 6, sh.y, sh.w - 12, sh.h, "#0e1c2a");
  for (let yy = sh.y; yy < sh.y + sh.h; yy += 6) rect(ctx, sh.x + 2, yy, sh.w - 4, 1, "#102030");
  rect(ctx, SHAFT_CENTER_X, sh.y, 1, sh.h, "#1d3446");
  glow(ctx, ectx, sh.x + 1, sh.y, 1, sh.h, "#1aa9c0");
  glow(ctx, ectx, sh.x + sh.w - 2, sh.y, 1, sh.h, "#1aa9c0");
  // glass highlights
  for (let yy = sh.y + 8; yy < sh.y + sh.h; yy += 28) {
    for (let k = 0; k < 10; k++) rect(ctx, sh.x + 4 + Math.floor(k / 2), yy + k, 1, 1, "rgba(160,230,255,0.10)");
  }
  softLight(light, SHAFT_CENTER_X, sh.y + sh.h / 2, sh.h / 2, "#22e6ff", 0.12);
  for (let f = 0; f < floors; f++) {
    const base = floorBase(f);
    rect(ctx, sh.x + 3, base - 20, sh.w - 6, 1, "#2a4a5e");
    rect(ctx, sh.x + 3, base - 20, 1, 20, "#2a4a5e");
    rect(ctx, sh.x + sh.w - 4, base - 20, 1, 20, "#2a4a5e");
    glow(ctx, ectx, SHAFT_CENTER_X - 1, base - 23, 2, 1, COLORS.yellow);
  }
}

function drawPillars(ctx: Ctx, floors: number): void {
  const y0 = floorTop(0);
  const h = floors * 56;
  for (const x of [COLUMNS[1].x - 1, SHAFT.x - 1, SHAFT.x + SHAFT.w - 1, COLUMNS[3].x - 1]) {
    rect(ctx, x, y0, 2, h, "#2a2440");
    rect(ctx, x, y0, 1, h, "#3a3358");
  }
}

function drawSlabs(ctx: Ctx, ectx: Ctx, trim: string, floors: number): void {
  for (let f = 0; f <= floors; f++) {
    const y = floorTop(f);
    rect(ctx, BUILDING_X, y, BUILDING_W, SLAB_H, "#262036");
    rect(ctx, BUILDING_X, y, BUILDING_W, 1, "#40385a");
    rect(ctx, BUILDING_X, y + 1, BUILDING_W, 1, "#322a48");
    rect(ctx, BUILDING_X, y + SLAB_H - 1, BUILDING_W, 1, "#141020");
    for (let bx = BUILDING_X + 6; bx < BUILDING_X + BUILDING_W; bx += 16) rect(ctx, bx, y + 3, 1, 1, "#4a4262");
    // neon under-glow strip
    if (f > 0) glow(ctx, ectx, BUILDING_X + 3, y + SLAB_H - 2, BUILDING_W - 6, 1, mix(trim, 0.35));
  }
}

// ---------------------------------------------------------------- rooms

/** Draw a room as a lit box: side walls, ceiling, back wall and a floor in perspective. */
function drawBox(ctx: Ctx, r: Rect, wall: string, floorColor: string, lit: boolean): void {
  const base = r.y + r.h;
  const back = lit ? wall : "#0c0a12";
  const side = mix(lit ? wall : "#0c0a12", lit ? 0.62 : 0.9);
  const ceil = mix(lit ? wall : "#0c0a12", lit ? 0.45 : 0.8);
  // side walls (trapezoids, widest at the front)
  for (let c = 0; c < DEPTH; c++) {
    const yTop = r.y + Math.round((c * CEIL) / DEPTH);
    const yBot = base - Math.round((c * FLOOR_D) / DEPTH);
    rect(ctx, r.x + c, yTop, 1, yBot - yTop, side);
    rect(ctx, r.x + r.w - 1 - c, yTop, 1, yBot - yTop, side);
  }
  // ceiling
  for (let i = 0; i < CEIL; i++) {
    const inset = Math.round((i * DEPTH) / CEIL);
    rect(ctx, r.x + inset, r.y + i, r.w - inset * 2, 1, ceil);
  }
  // back wall
  rect(ctx, r.x + DEPTH, r.y + CEIL, r.w - DEPTH * 2, r.h - CEIL - FLOOR_D, back);
  // floor, lighter toward the front
  for (let j = 0; j < FLOOR_D; j++) {
    const inset = Math.round(((FLOOR_D - 1 - j) * DEPTH) / (FLOOR_D - 1));
    rect(ctx, r.x + inset, base - FLOOR_D + j, r.w - inset * 2, 1, mix(floorColor, (lit ? 0.75 : 0.4) + (j / FLOOR_D) * 0.4));
  }
  if (!lit) return;
  // floor seams converging toward the back
  for (let k = 1; k < 6; k++) {
    const fx = r.x + (k * r.w) / 6;
    const bx = r.x + DEPTH + (k * (r.w - DEPTH * 2)) / 6;
    for (let j = 0; j < FLOOR_D; j++) {
      const t = j / (FLOOR_D - 1);
      rect(ctx, Math.round(bx + (fx - bx) * t), base - FLOOR_D + j, 1, 1, "rgba(0,0,0,0.18)");
    }
  }
  // baseboard and wall panel seams
  rect(ctx, r.x + DEPTH, base - FLOOR_D - 1, r.w - DEPTH * 2, 1, "rgba(0,0,0,0.35)");
  for (let px = r.x + DEPTH + 9; px < r.x + r.w - DEPTH; px += 13) rect(ctx, px, r.y + CEIL + 6, 1, r.h - CEIL - FLOOR_D - 7, "rgba(255,255,255,0.035)");
  // ambient occlusion in the back corners and under the ceiling
  for (let i = 0; i < 3; i++) {
    rect(ctx, r.x + DEPTH + i, r.y + CEIL, 1, r.h - CEIL - FLOOR_D, `rgba(0,0,0,${0.22 - i * 0.07})`);
    rect(ctx, r.x + r.w - DEPTH - 1 - i, r.y + CEIL, 1, r.h - CEIL - FLOOR_D, `rgba(0,0,0,${0.22 - i * 0.07})`);
    rect(ctx, r.x + DEPTH, r.y + CEIL + i, r.w - DEPTH * 2, 1, `rgba(0,0,0,${0.25 - i * 0.08})`);
  }
}

const FLOORS: Partial<Record<string, string>> = {
  CHILL: "#5a2a4a",
  CAFE: "#6a4a32",
  ROOFTOP_LOUNGE: "#2e4a3a",
  GYM: "#2a2a34",
  FACTORY: "#3a342a",
  SERVER_ROOM: "#1e2430",
  DATA_CENTER: "#1e2430",
  VAULT: "#3a3428",
};

function drawRoom(ctx: Ctx, ectx: Ctx, light: Ctx, slot: RoomSlot, wall: string): void {
  const r = roomRect(slot);
  const def = ROOM_DEFS[slot.type];
  const base = r.y + r.h;
  const lit = !slot.locked;
  drawBox(ctx, r, wall, FLOORS[slot.type] ?? "#3a3048", lit);

  if (!lit) {
    // dark, empty, hazard tape on the floor
    for (let i = -r.h; i < r.w; i += 8) {
      for (let k = 0; k < 4; k++) {
        const x = r.x + i + k;
        if (x >= r.x + 3 && x < r.x + r.w - 3) rect(ctx, x, base - 4 + (k % 2), 1, 1, k < 2 ? "#4a3e12" : "#141018");
      }
    }
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2 + 1;
    if (slot.type === "EMPTY") {
      // scaffolding + a plus sign: build here
      for (let x = r.x + 10; x < r.x + r.w - 10; x += 14) rect(ctx, x, r.y + 8, 1, r.h - 14, "#2a2640");
      rect(ctx, r.x + 10, r.y + 16, r.w - 20, 1, "#2a2640");
      rect(ctx, r.x + 10, r.y + 30, r.w - 20, 1, "#2a2640");
      rect(ctx, cx - 4, cy - 1, 9, 3, "#4a4466");
      rect(ctx, cx - 1, cy - 4, 3, 9, "#4a4466");
    } else {
      rect(ctx, cx - 4, cy - 1, 9, 7, "#3a3450");
      rect(ctx, cx - 3, cy - 5, 1, 4, "#3a3450");
      rect(ctx, cx + 3, cy - 5, 1, 4, "#3a3450");
      rect(ctx, cx - 3, cy - 6, 7, 1, "#3a3450");
      rect(ctx, cx, cy + 1, 1, 3, "#0c0a12");
    }
    return;
  }

  // ceiling lamp + light cone + the sign's colored spill
  const lampX = r.x + r.w / 2;
  glow(ctx, ectx, lampX - 4, r.y + CEIL - 1, 8, 1, "#e6e0ff");
  for (let i = 0; i < 26; i++) {
    const half = 4 + i * 0.9;
    rect(ctx, lampX - half, r.y + CEIL + i, half * 2, 1, `rgba(220,214,255,${0.06 * (1 - i / 26)})`);
  }
  for (let i = 0; i < 10; i++) rect(ctx, r.x + DEPTH, r.y + CEIL + i, r.w - DEPTH * 2, 1, hexA(def.color, 0.07 * (1 - i / 10)));
  softLight(light, lampX, r.y + r.h * 0.45, r.w * 0.55, "#d8d0ff", 0.22);
  softLight(light, lampX, r.y + 8, r.w * 0.4, def.color, 0.28);
  glow(ctx, ectx, r.x + 1, base - 1, r.w - 2, 1, dim(def.color));

  drawProps(ctx, ectx, light, slot, r, base);
  drawLevelExtras(ctx, ectx, light, slot, r, base);
}

const at = (r: Rect, s: Spot) => r.x + s.dx;
const WY = (r: Rect) => r.y + CEIL + 6; // top of wall-mounted things

export type ScreenKind = "map" | "bars" | "dollar" | "heart" | "ticker";
export interface WallScreen extends Rect {
  color: string;
  kind: ScreenKind;
}

/** Wall screens per room type; the renderer animates their content every frame. */
export function wallScreens(slot: RoomSlot): WallScreen[] {
  const r = roomRect(slot);
  const wy = WY(r);
  switch (slot.type) {
    case "COMMAND":
      return [{ x: r.x + 8, y: wy, w: r.w - 16, h: 11, color: COLORS.cyan, kind: "map" }];
    case "WAR_ROOM":
      return [{ x: r.x + 14, y: wy, w: 36, h: 10, color: COLORS.red, kind: "bars" }];
    case "REVENUE_BAY":
      return [
        { x: r.x + 8, y: wy, w: 32, h: 11, color: COLORS.green, kind: "bars" },
        { x: r.x + 44, y: wy, w: 12, h: 11, color: COLORS.yellow, kind: "dollar" },
      ];
    case "TREASURY":
      return [{ x: r.x + 8, y: wy, w: 24, h: 9, color: COLORS.yellow, kind: "bars" }];
    case "CHILL":
      return [{ x: r.x + 36, y: wy, w: 14, h: 9, color: COLORS.pink, kind: "heart" }];
    case "TRADING_DESK":
      return [{ x: r.x + 7, y: wy - 1, w: r.w - 14, h: 12, color: COLORS.green, kind: "ticker" }];
    default:
      return [];
  }
}

/** Furniture that arrives with each upgrade level, so a Level 4 room looks the part. */
function drawLevelExtras(ctx: Ctx, ectx: Ctx, light: Ctx, slot: RoomSlot, r: Rect, base: number): void {
  const def = ROOM_DEFS[slot.type];
  const wy = WY(r);
  const lvl = slot.level;
  if (lvl >= 2) {
    // potted plant by the left wall
    const px = r.x + DEPTH + 1;
    rect(ctx, px, base - 4, 4, 4, "#5a3a2a");
    rect(ctx, px, base - 4, 4, 1, "#8a5a3a");
    rect(ctx, px - 1, base - 9, 6, 5, "#1d7a3e");
    rect(ctx, px, base - 11, 4, 2, "#2a9a50");
    rect(ctx, px + 1, base - 12, 2, 1, "#39ff88");
  }
  if (lvl >= 3) {
    // framed print on the right wall, in the room's colour
    const fx = r.x + r.w - DEPTH - 13;
    const fy = wy + 13;
    rect(ctx, fx, fy, 11, 8, "#3a3446");
    rect(ctx, fx + 1, fy + 1, 9, 6, "#14121c");
    glow(ctx, ectx, fx + 2, fy + 4, 7, 2, dim(def.color));
    glow(ctx, ectx, fx + 3, fy + 2, 2, 2, def.color);
    rect(ctx, fx + 6, fy + 2, 3, 1, dim(def.color));
  }
  if (lvl >= 4) {
    // LED strip under the ceiling and a rug
    glow(ctx, ectx, r.x + DEPTH + 2, r.y + CEIL + 1, r.w - DEPTH * 2 - 4, 1, dim(def.color));
    softLight(light, r.x + r.w / 2, r.y + CEIL + 4, r.w * 0.5, def.color, 0.18);
    const rx = r.x + r.w / 2 - 12;
    rect(ctx, rx, base - 1, 24, 1, mix(def.color, 0.35));
    rect(ctx, rx + 2, base - 1, 20, 1, mix(def.color, 0.5));
  }
  if (lvl >= 5) {
    // trophy shelf and a neon underglow along the floor
    const sx = r.x + DEPTH + 2;
    const sy = wy + 16;
    rect(ctx, sx, sy + 4, 14, 1, "#5a4a6a");
    for (let i = 0; i < 3; i++) {
      glow(ctx, ectx, sx + 1 + i * 5, sy + 1, 3, 2, COLORS.yellow);
      rect(ctx, sx + 2 + i * 5, sy + 3, 1, 1, "#e0b23a");
    }
    glow(ctx, ectx, r.x + DEPTH, base - 1, r.w - DEPTH * 2, 1, def.color);
    softLight(light, r.x + r.w / 2, base - 2, r.w * 0.6, def.color, 0.25);
  }
}

function drawProps(ctx: Ctx, ectx: Ctx, light: Ctx, slot: RoomSlot, r: Rect, base: number): void {
  const def = ROOM_DEFS[slot.type];
  const desks = (color: string) => def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(r, s), base, color));
  const wy = WY(r);
  switch (slot.type) {
    case "COMMAND":
      drawWallScreen(ctx, ectx, { x: r.x + 8, y: wy, w: r.w - 16, h: 11 }, COLORS.cyan, "map");
      desks(COLORS.cyan);
      break;
    case "WAR_ROOM":
      drawWallScreen(ctx, ectx, { x: r.x + 14, y: wy, w: 36, h: 10 }, COLORS.red, "bars");
      rect(ctx, r.x + 15, base - 8, 34, 2, "#3b2c3a");
      rect(ctx, r.x + 15, base - 8, 34, 1, "#5a4256");
      rect(ctx, r.x + 18, base - 6, 1, 5, "#2a2030");
      rect(ctx, r.x + 45, base - 6, 1, 5, "#2a2030");
      glow(ctx, ectx, r.x + 30, base - 9, 4, 1, COLORS.red);
      def.spots.filter((s) => s.kind === "chair").forEach((s) => drawChair(ctx, at(r, s), base, s.face));
      break;
    case "REVENUE_BAY":
      drawWallScreen(ctx, ectx, { x: r.x + 8, y: wy, w: 32, h: 11 }, COLORS.green, "bars");
      drawWallScreen(ctx, ectx, { x: r.x + 44, y: wy, w: 12, h: 11 }, COLORS.yellow, "dollar");
      desks(COLORS.green);
      break;
    case "TREASURY": {
      const vx = r.x + r.w - 22;
      rect(ctx, vx, wy, 15, 15, "#3a3446");
      rect(ctx, vx + 2, wy + 2, 11, 11, "#4a4458");
      rect(ctx, vx + 7, wy + 4, 1, 7, "#2a2436");
      rect(ctx, vx + 4, wy + 7, 7, 1, "#2a2436");
      glow(ctx, ectx, vx + 12, wy + 2, 1, 1, COLORS.green);
      drawWallScreen(ctx, ectx, { x: r.x + 8, y: wy, w: 24, h: 9 }, COLORS.yellow, "bars");
      desks(COLORS.yellow);
      break;
    }
    case "FACTORY": {
      rect(ctx, r.x + 7, wy, r.w - 14, 1, "#5a5070");
      const shirts = [COLORS.pink, COLORS.cyan, COLORS.yellow, COLORS.green, COLORS.purple];
      for (let i = 0; i < 5; i++) drawShirt(ctx, r.x + 9 + i * 10, wy + 1, shirts[i]);
      def.spots.filter((s) => s.kind === "bench").forEach((s, i) => drawBench(ctx, ectx, at(r, s), base, i));
      rect(ctx, r.x + r.w - 9, base - 7, 5, 5, "#7a5a3a");
      rect(ctx, r.x + r.w - 9, base - 5, 5, 1, "#5a402a");
      break;
    }
    case "CHILL": {
      rect(ctx, r.x + 8, wy + 8, 22, 1, "#4a3a50");
      for (let i = 0; i < 7; i++) glow(ctx, ectx, r.x + 9 + i * 3, wy + 5, 1, 3, [COLORS.pink, COLORS.cyan, COLORS.green, COLORS.yellow][i % 4]);
      drawWallScreen(ctx, ectx, { x: r.x + 36, y: wy, w: 14, h: 9 }, COLORS.pink, "heart");
      drawCouch(ctx, r.x + 3, base, 24, "#7a1f6a", "#9a2a86");
      const px = r.x + 35;
      rect(ctx, px, base - 9, 14, 1, "#4a2a18");
      rect(ctx, px + 1, base - 8, 12, 2, "#1d7a3e");
      rect(ctx, px, base - 6, 14, 1, "#4a2a18");
      rect(ctx, px + 1, base - 5, 2, 5, "#3a2012");
      rect(ctx, px + 11, base - 5, 2, 5, "#3a2012");
      rect(ctx, px + 4, base - 10, 1, 1, "#ffffff");
      rect(ctx, px + 8, base - 10, 1, 1, COLORS.red);
      const ax = r.x + r.w - 8;
      rect(ctx, ax, base - 18, 6, 18, "#2a1d48");
      glow(ctx, ectx, ax + 1, base - 16, 4, 4, COLORS.cyan);
      glow(ctx, ectx, ax, base - 18, 6, 1, COLORS.purple);
      softLight(light, ax + 3, base - 14, 16, COLORS.cyan, 0.4);
      break;
    }
    case "SERVER_ROOM":
    case "DATA_CENTER": {
      const accent = slot.type === "SERVER_ROOM" ? COLORS.purple : COLORS.green;
      for (let i = 0; i < 3; i++) {
        const sx = r.x + 7 + i * 10;
        rect(ctx, sx, base - 33, 9, 32, "#15151f");
        rect(ctx, sx, base - 33, 9, 1, "#2a2a3a");
        rect(ctx, sx + 8, base - 33, 1, 32, "#0c0c14");
        for (let yy = base - 31; yy < base - 3; yy += 3) rect(ctx, sx + 1, yy, 7, 1, "#202030");
      }
      rect(ctx, r.x + 44, base - 9, 13, 1, "#3a3450");
      rect(ctx, r.x + 47, base - 15, 6, 5, "#1a1a26");
      glow(ctx, ectx, r.x + 48, base - 14, 4, 3, accent);
      softLight(light, r.x + 22, base - 18, 26, accent, 0.3);
      break;
    }
    case "MARKETING_LAB": {
      rect(ctx, r.x + 8, wy, 26, 13, "#d8d4e8");
      rect(ctx, r.x + 8, wy + 13, 26, 1, "#8a84a8");
      const notes = [COLORS.yellow, COLORS.pink, COLORS.cyan, COLORS.green];
      for (let i = 0; i < 6; i++) rect(ctx, r.x + 10 + (i % 3) * 8, wy + 2 + Math.floor(i / 3) * 5, 4, 3, notes[i % 4]);
      rect(ctx, r.x + 50, base - 26, 1, 26, "#3a3450");
      glow(ctx, ectx, r.x + 47, base - 31, 7, 1, "#fff6e0");
      glow(ctx, ectx, r.x + 47, base - 31, 1, 5, "#fff6e0");
      glow(ctx, ectx, r.x + 53, base - 31, 1, 5, "#fff6e0");
      glow(ctx, ectx, r.x + 47, base - 27, 7, 1, "#fff6e0");
      desks(COLORS.pink);
      break;
    }
    case "RECORDING_STUDIO": {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) rect(ctx, r.x + 34 + i * 6, wy + j * 6, 5, 5, (i + j) % 2 ? "#2a1f3e" : "#33264c");
      rect(ctx, r.x + 6, base - 9, 24, 3, "#2a2438");
      for (let i = 0; i < 7; i++) glow(ctx, ectx, r.x + 8 + i * 3, base - 9 + (i % 3 === 0 ? 0 : 1), 1, 1, i % 2 ? COLORS.cyan : COLORS.purple);
      rect(ctx, r.x + 8, base - 6, 1, 6, "#1c1828");
      rect(ctx, r.x + 27, base - 6, 1, 6, "#1c1828");
      rect(ctx, r.x + 50, base - 18, 1, 18, "#6c7488");
      rect(ctx, r.x + 48, base - 1, 5, 1, "#6c7488");
      rect(ctx, r.x + 49, base - 21, 3, 3, "#9aa3b5");
      glow(ctx, ectx, r.x + 12, wy, 8, 3, COLORS.red);
      break;
    }
    case "VAULT": {
      const cx = r.x + 22;
      const cy = wy + 12;
      for (let dy = -11; dy <= 11; dy++)
        for (let dx = -11; dx <= 11; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= 11) rect(ctx, cx + dx, cy + dy, 1, 1, d > 9 ? "#5a5470" : d > 4 ? "#3a3450" : "#4a4460");
        }
      rect(ctx, cx - 6, cy, 13, 1, "#6c7488");
      rect(ctx, cx, cy - 6, 1, 13, "#6c7488");
      glow(ctx, ectx, cx + 8, cy - 8, 1, 1, COLORS.green);
      for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) rect(ctx, r.x + 40 + j * 6 + (2 - i) * 3, base - 4 - (2 - i) * 3, 5, 3, j % 2 ? "#e0b23a" : COLORS.yellow);
      softLight(light, r.x + 48, base - 6, 16, COLORS.yellow, 0.35);
      break;
    }
    case "ROOFTOP_LOUNGE": {
      for (let x = r.x + DEPTH; x < r.x + r.w - DEPTH; x += 2) {
        const sag = Math.round(Math.sin(((x - r.x) / r.w) * Math.PI) * 4);
        rect(ctx, x, wy + sag, 1, 1, "#3a3450");
        if ((x - r.x) % 8 === 0) glow(ctx, ectx, x, wy + 1 + sag, 1, 1, [COLORS.yellow, COLORS.pink, COLORS.cyan][((x - r.x) / 8) % 3]);
      }
      for (const px of [r.x + 5, r.x + r.w - 10]) {
        rect(ctx, px, base - 5, 5, 5, "#5a3a2a");
        rect(ctx, px - 1, base - 11, 7, 6, "#1d7a3e");
        rect(ctx, px + 1, base - 14, 3, 3, "#2a9a50");
      }
      drawCouch(ctx, r.x + 10, base, 20, "#2b5b9a", "#3a72b8");
      rect(ctx, r.x + 38, base - 10, 14, 2, "#5a4a6a");
      rect(ctx, r.x + 40, base - 8, 1, 8, "#3a3048");
      rect(ctx, r.x + 50, base - 8, 1, 8, "#3a3048");
      glow(ctx, ectx, r.x + 42, base - 13, 1, 3, COLORS.pink);
      glow(ctx, ectx, r.x + 46, base - 12, 1, 2, COLORS.cyan);
      break;
    }
    case "TRADING_DESK": {
      rect(ctx, r.x + 7, wy - 1, r.w - 14, 12, "#07080e");
      const rng = mulberry32(r.x + 77);
      let y = wy + 5;
      for (let x = r.x + 8; x < r.x + r.w - 8; x++) {
        y = Math.max(wy, Math.min(wy + 9, y + (rng() < 0.5 ? -1 : 1)));
        glow(ctx, ectx, x, y, 1, 1, x % 9 < 5 ? COLORS.green : COLORS.red);
      }
      desks(COLORS.green);
      break;
    }
    case "GYM": {
      // treadmill, weight rack, exercise bike
      const tx = r.x + 6;
      rect(ctx, tx, base - 3, 16, 2, "#2a2a3a");
      rect(ctx, tx + 13, base - 12, 2, 10, "#3a3a4a");
      glow(ctx, ectx, tx + 12, base - 13, 4, 2, COLORS.green);
      rect(ctx, r.x + 26, base - 14, 1, 14, "#4a4a5a");
      rect(ctx, r.x + 38, base - 14, 1, 14, "#4a4a5a");
      for (let i = 0; i < 3; i++) rect(ctx, r.x + 27, base - 13 + i * 4, 11, 1, "#5a5a6a");
      for (let i = 0; i < 3; i++) rect(ctx, r.x + 28 + i * 3, base - 12 + i * 4, 2, 3, "#22222e");
      rect(ctx, r.x + 47, base - 6, 10, 1, "#3a3a4a");
      rect(ctx, r.x + 52, base - 10, 1, 5, "#3a3a4a");
      rect(ctx, r.x + 47, base - 3, 3, 3, "#22222e");
      rect(ctx, r.x + 55, base - 3, 3, 3, "#22222e");
      rect(ctx, r.x + 8, wy, r.w - 16, 8, "#9aa3b5");
      rect(ctx, r.x + 9, wy + 1, r.w - 18, 6, "#c8d0e0");
      break;
    }
    case "CAFE": {
      // counter, espresso machine, menu board, tables
      rect(ctx, r.x + 6, base - 10, 22, 10, "#5a3a2a");
      rect(ctx, r.x + 6, base - 10, 22, 1, "#8a5a3a");
      rect(ctx, r.x + 9, base - 17, 7, 7, "#9aa3b5");
      glow(ctx, ectx, r.x + 10, base - 15, 2, 1, COLORS.red);
      rect(ctx, r.x + 20, base - 13, 2, 3, "#e8e0d0");
      rect(ctx, r.x + 8, wy, 22, 10, "#1a1410");
      for (let i = 0; i < 4; i++) glow(ctx, ectx, r.x + 10, wy + 2 + i * 2, 10 + (i % 2) * 4, 1, mix(COLORS.yellow, 0.7));
      for (const tx of [r.x + 36, r.x + 50]) {
        rect(ctx, tx - 3, base - 8, 8, 1, "#6a4a32");
        rect(ctx, tx, base - 7, 1, 7, "#3a2a1e");
      }
      softLight(light, r.x + 17, base - 14, 20, COLORS.yellow, 0.35);
      break;
    }
    case "NAP_PODS": {
      for (let i = 0; i < 3; i++) {
        const px = r.x + 3 + i * 20;
        rect(ctx, px, base - 13, 17, 13, "#1a1630");
        rect(ctx, px + 1, base - 12, 15, 1, "#2e2850");
        rect(ctx, px + 1, base - 5, 15, 3, "#3a3060");
        glow(ctx, ectx, px + 1, base - 13, 15, 1, mix(COLORS.purple, 0.7));
        softLight(light, px + 8, base - 8, 12, COLORS.purple, 0.3);
      }
      break;
    }
    case "OFFICE":
      rect(ctx, r.x + 8, wy, 10, 12, "#2a2a3a");
      rect(ctx, r.x + 9, wy + 1, 8, 10, "#2e5a3a");
      for (let i = 0; i < 4; i++) rect(ctx, r.x + 24 + i * 7, wy + 2, 5, 7, ["#ffd84a", "#22e6ff", "#ff2bd6", "#39ff88"][i]);
      desks(COLORS.cyan);
      break;
    case "PODCAST_BOOTH": {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) rect(ctx, r.x + 8 + i * 9, wy + j * 7, 8, 6, (i + j) % 2 ? "#2a1f2e" : "#3a2638");
      glow(ctx, ectx, r.x + 26, wy - 1, 12, 4, COLORS.red);
      rect(ctx, r.x + 20, base - 8, 26, 2, "#3a2c3a");
      rect(ctx, r.x + 32, base - 6, 1, 6, "#2a2030");
      for (const mx of [r.x + 24, r.x + 41]) {
        rect(ctx, mx, base - 13, 1, 5, "#6c7488");
        rect(ctx, mx - 1, base - 15, 3, 2, "#9aa3b5");
      }
      def.spots.filter((s) => s.kind === "chair").forEach((s) => drawChair(ctx, at(r, s), base, s.face));
      break;
    }
    case "MERCH_STORE": {
      // shelves of products and a till
      for (let row = 0; row < 3; row++) {
        rect(ctx, r.x + 8, wy + row * 7 + 6, r.w - 16, 1, "#5a4a6a");
        for (let i = 0; i < 8; i++) drawShirt(ctx, r.x + 9 + i * 6, wy + row * 7, [COLORS.pink, COLORS.cyan, COLORS.yellow, COLORS.green][(i + row) % 4]);
      }
      rect(ctx, r.x + 26, base - 9, 14, 9, "#3a3048");
      rect(ctx, r.x + 26, base - 9, 14, 1, "#5a4a6a");
      glow(ctx, ectx, r.x + 30, base - 12, 5, 3, COLORS.green);
      break;
    }
    default:
      desks(def.color);
  }
}

function drawCouch(ctx: Ctx, x: number, base: number, w: number, back: string, seat: string): void {
  rect(ctx, x, base - 10, w, 5, back);
  rect(ctx, x, base - 10, w, 1, mix(back.startsWith("#") ? back : "#7a1f6a", 1.3));
  rect(ctx, x, base - 5, w, 3, seat);
  rect(ctx, x - 1, base - 7, 2, 5, mix(back.startsWith("#") ? back : "#7a1f6a", 0.75));
  rect(ctx, x + w - 1, base - 7, 2, 5, mix(back.startsWith("#") ? back : "#7a1f6a", 0.75));
  rect(ctx, x + 1, base - 2, 1, 2, "#2a1028");
  rect(ctx, x + w - 2, base - 2, 1, 2, "#2a1028");
}

function drawDesk(ctx: Ctx, ectx: Ctx, sx: number, base: number, color: string): void {
  drawChair(ctx, sx, base, 1);
  rect(ctx, sx + 4, base - 7, 13, 1, "#5a4a6a");
  rect(ctx, sx + 4, base - 6, 13, 1, "#3a3048");
  rect(ctx, sx + 15, base - 5, 1, 5, "#2e263c");
  rect(ctx, sx + 5, base - 5, 1, 5, "#2e263c");
  rect(ctx, sx + 9, base - 15, 7, 6, "#14121c");
  glow(ctx, ectx, sx + 10, base - 14, 5, 4, dim(color));
  rect(ctx, sx + 10, base - 13, 3, 1, color);
  rect(ctx, sx + 12, base - 9, 1, 2, "#14121c");
  rect(ctx, sx + 6, base - 9, 2, 2, "#d8d0e8");
}

function drawChair(ctx: Ctx, sx: number, base: number, face: 1 | -1): void {
  const back = face === 1 ? sx - 4 : sx + 3;
  rect(ctx, back, base - 9, 1, 7, "#3a3050");
  rect(ctx, face === 1 ? sx - 4 : sx - 3, base - 2, 7, 1, "#4a3e62");
  rect(ctx, sx - 1, base - 1, 1, 1, "#2a2236");
}

function drawBench(ctx: Ctx, ectx: Ctx, sx: number, base: number, i: number): void {
  rect(ctx, sx + 3, base - 9, 12, 2, "#5a4a3a");
  rect(ctx, sx + 4, base - 7, 1, 7, "#3a2e24");
  rect(ctx, sx + 13, base - 7, 1, 7, "#3a2e24");
  if (i % 3 === 0) drawShirt(ctx, sx + 6, base - 14, COLORS.pink);
  else if (i % 3 === 1) {
    rect(ctx, sx + 7, base - 13, 3, 4, "#e8d8b0");
    glow(ctx, ectx, sx + 8, base - 15, 1, 2, COLORS.orange);
  } else {
    rect(ctx, sx + 6, base - 15, 7, 6, "#2a2a3a");
    glow(ctx, ectx, sx + 7, base - 14, 5, 3, COLORS.cyan);
  }
}

function drawShirt(ctx: Ctx, x: number, y: number, color: string): void {
  rect(ctx, x + 1, y, 3, 1, color);
  rect(ctx, x, y + 1, 5, 1, color);
  rect(ctx, x + 1, y + 2, 3, 3, color);
}

function drawWallScreen(ctx: Ctx, ectx: Ctx, s: Rect, color: string, kind: "map" | "bars" | "dollar" | "heart"): void {
  rect(ctx, s.x - 1, s.y - 1, s.w + 2, s.h + 2, "#2a2438");
  rect(ctx, s.x, s.y, s.w, s.h, "#07080e");
  const rng = mulberry32(s.x * 31 + s.y);
  if (kind === "bars") {
    for (let i = 0; i < Math.floor((s.w - 2) / 3); i++) {
      const h = 2 + Math.floor(rng() * (s.h - 3));
      glow(ctx, ectx, s.x + 1 + i * 3, s.y + s.h - 1 - h, 2, h, color);
    }
  } else if (kind === "map") {
    for (let i = 0; i < 40; i++) rect(ctx, s.x + 1 + Math.floor(rng() * (s.w - 2)), s.y + 1 + Math.floor(rng() * (s.h - 2)), 1, 1, dim(color));
    for (let i = 0; i < 6; i++) glow(ctx, ectx, s.x + 2 + Math.floor(rng() * (s.w - 4)), s.y + 2 + Math.floor(rng() * (s.h - 4)), 1, 1, color);
  } else if (kind === "dollar") {
    const cx = s.x + Math.floor(s.w / 2) - 1;
    for (const [dx, dy, w, h] of [
      [0, 2, 3, 1],
      [0, 4, 3, 1],
      [0, 6, 3, 1],
      [0, 2, 1, 3],
      [2, 4, 1, 3],
      [1, 1, 1, 7],
    ])
      glow(ctx, ectx, cx + dx, s.y + dy, w, h, color);
  } else {
    const cx = s.x + Math.floor(s.w / 2) - 3;
    const cy = s.y + 2;
    for (const [dx, dy, w, h] of [
      [0, 0, 2, 2],
      [3, 0, 2, 2],
      [-1, 1, 7, 2],
      [0, 3, 5, 1],
      [1, 4, 3, 1],
      [2, 5, 1, 1],
    ])
      glow(ctx, ectx, cx + dx, cy + dy, w, h, color);
  }
}
