/** The neon city around HQ: near buildings (drawn with the world) and far skyline layers (parallax). */
import { BUILDING_W, BUILDING_X, COLORS, WORLD_W } from "@/game/constants";
import { mulberry32 } from "@/game/sim";
import { drawPixelText, GLYPH_H, textWidth } from "./font";

type Ctx = CanvasRenderingContext2D;

export interface Blinker {
  x: number;
  y: number;
  color: string;
  period: number;
  phase: number;
}

/** Shop and sign names are generic words, not real brands. */
const SIGNS = ["HOTEL", "RAMEN", "NOODLE", "ARCADE", "OPEN", "BAR", "24H", "SUSHI", "KARAOKE", "TATTOO", "CLINIC", "PHO", "DINER", "MOTEL", "LOANS", "BOBA"];
const SHOPS = ["RAMEN", "24/7", "BAR", "NOODLE", "MART", "PAWN", "CAFE", "PIZZA", "RADIO", "DUMPLING", "LAUNDRY"];
const NEON = [COLORS.pink, COLORS.cyan, COLORS.purple, COLORS.yellow, COLORS.green, COLORS.orange, COLORS.red];
const BODIES = ["#141226", "#16162b", "#1a1430", "#121a28", "#1b1228", "#151a2e"];
const WINDOW_LIT = ["#ffd38a", "#ffe9b0", "#8ad8ff", "#c8b8ff", "#ff9ad8"];

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Vertical neon sign: letters stacked top to bottom inside a frame. */
function verticalSign(ctx: Ctx, ectx: Ctx, x: number, y: number, text: string, color: string): number {
  const h = text.length * (GLYPH_H + 1) + 3;
  px(ctx, x, y, 7, h, "#07060c");
  for (const c of [ctx, ectx]) {
    c.fillStyle = color;
    c.fillRect(x, y, 7, 1);
    c.fillRect(x, y + h - 1, 7, 1);
    c.fillRect(x, y, 1, h);
    c.fillRect(x + 6, y, 1, h);
  }
  [...text].forEach((ch, i) => {
    drawPixelText(ctx, ch, x + 2, y + 2 + i * (GLYPH_H + 1), color);
    drawPixelText(ectx, ch, x + 2, y + 2 + i * (GLYPH_H + 1), color);
  });
  return h;
}

/**
 * Near city: neighbor buildings on both sides of HQ, standing on the street.
 * Returns antenna lights to blink at runtime.
 */
export function drawNearCity(ctx: Ctx, ectx: Ctx, light: Ctx, groundY: number): Blinker[] {
  const rng = mulberry32(2024);
  const blinkers: Blinker[] = [];
  const zones: [number, number][] = [
    [-6, BUILDING_X - 14],
    [BUILDING_X + BUILDING_W + 14, WORLD_W + 6],
  ];
  for (const [z0, z1] of zones) {
    let x = z0;
    while (x < z1 - 20) {
      const w = Math.min(z1 - x, 46 + Math.floor(rng() * 54));
      const h = 110 + Math.floor(rng() * 300);
      const top = groundY - h;
      const body = BODIES[Math.floor(rng() * BODIES.length)];
      // body with lit left edge and shadowed right edge for depth
      px(ctx, x, top, w, h, body);
      px(ctx, x, top, 1, h, shade(body, 1.6));
      px(ctx, x + w - 2, top, 2, h, shade(body, 0.6));
      px(ctx, x, top, w, 2, shade(body, 1.4));
      // windows
      const litChance = 0.25 + rng() * 0.35;
      const warm = rng() < 0.6;
      for (let wy = top + 6; wy < groundY - 16; wy += 7) {
        for (let wx = x + 4; wx < x + w - 5; wx += 6) {
          const r = rng();
          if (r < litChance) {
            const c = warm ? WINDOW_LIT[Math.floor(rng() * 2)] : WINDOW_LIT[2 + Math.floor(rng() * 3)];
            px(ctx, wx, wy, 3, 4, c);
            px(ctx, wx, wy + 3, 3, 1, shade(c.startsWith("#") ? c : "#888888", 0.7));
            if (rng() < 0.18) px(ectx, wx, wy, 3, 4, shade(c, 0.6));
          } else {
            px(ctx, wx, wy, 3, 4, "#0c0b18");
            px(ctx, wx, wy, 1, 1, "#24223e");
          }
        }
      }
      // fire escape
      if (rng() < 0.35 && w > 50) {
        const fx = x + w - 14;
        for (let fy = top + 20; fy < groundY - 30; fy += 22) {
          px(ctx, fx - 4, fy, 14, 1, "#3a3650");
          for (let k = 0; k < 10; k++) px(ctx, fx - 4 + k, fy + 2 + k * 2, 1, 1, "#2e2a44");
        }
      }
      // vertical neon sign
      if (rng() < 0.55 && h > 140) {
        const text = SIGNS[Math.floor(rng() * SIGNS.length)];
        const sx = rng() < 0.5 ? x - 3 : x + w - 4;
        const sy = top + 18 + Math.floor(rng() * Math.max(1, h - 120));
        const color = NEON[Math.floor(rng() * NEON.length)];
        const sh = verticalSign(ctx, ectx, sx, sy, text, color);
        softLight(light, sx + 3.5, sy + sh / 2, 34, color, 0.35);
      }
      // roof: antenna, water tank or billboard
      const roof = rng();
      if (roof < 0.35) {
        const ax = x + 6 + Math.floor(rng() * (w - 12));
        px(ctx, ax, top - 22, 1, 22, "#3a3650");
        px(ctx, ax - 3, top - 14, 7, 1, "#3a3650");
        blinkers.push({ x: ax, y: top - 23, color: COLORS.red, period: 900 + rng() * 900, phase: rng() * 1000 });
      } else if (roof < 0.6) {
        const tx = x + 6 + Math.floor(rng() * Math.max(1, w - 22));
        px(ctx, tx, top - 14, 12, 10, "#2a2232");
        px(ctx, tx, top - 15, 12, 1, "#3a3048");
        for (let k = 0; k < 12; k += 3) px(ctx, tx + k, top - 13, 1, 9, "#221a2a");
        px(ctx, tx + 1, top - 4, 1, 4, "#2a2232");
        px(ctx, tx + 10, top - 4, 1, 4, "#2a2232");
      } else if (roof < 0.85 && w > 48) {
        const text = SIGNS[Math.floor(rng() * SIGNS.length)];
        const color = NEON[Math.floor(rng() * NEON.length)];
        const bw = Math.min(w - 8, textWidth(text) + 10);
        const bx = x + Math.floor((w - bw) / 2);
        const by = top - 20;
        px(ctx, bx, by, bw, 13, "#08070d");
        for (const c of [ctx, ectx]) {
          c.fillStyle = color;
          c.fillRect(bx, by, bw, 1);
          c.fillRect(bx, by + 12, bw, 1);
        }
        drawPixelText(ctx, text, bx + Math.floor((bw - textWidth(text)) / 2), by + 4, color);
        drawPixelText(ectx, text, bx + Math.floor((bw - textWidth(text)) / 2), by + 4, color);
        px(ctx, bx + 3, by + 13, 1, 7, "#3a3650");
        px(ctx, bx + bw - 4, by + 13, 1, 7, "#3a3650");
        softLight(light, bx + bw / 2, by + 6, 40, color, 0.3);
      }
      // street-level shopfront
      if (w > 30) {
        const shop = SHOPS[Math.floor(rng() * SHOPS.length)];
        const color = NEON[Math.floor(rng() * NEON.length)];
        px(ctx, x + 3, groundY - 14, w - 6, 14, "#0a0912");
        px(ctx, x + 5, groundY - 11, w - 10, 9, shade(color, 0.22));
        px(ctx, x + 5, groundY - 11, w - 10, 1, shade(color, 0.5));
        // awning stripes
        for (let k = x + 3; k < x + w - 3; k += 4) px(ctx, k, groundY - 16, 2, 2, color);
        const tw = textWidth(shop);
        if (tw < w - 8) {
          drawPixelText(ctx, shop, x + Math.floor((w - tw) / 2), groundY - 23, color);
          drawPixelText(ectx, shop, x + Math.floor((w - tw) / 2), groundY - 23, color);
        }
        softLight(light, x + w / 2, groundY - 6, Math.min(50, w), color, 0.4);
      }
      x += w + 2 + Math.floor(rng() * 6);
    }
  }
  return blinkers;
}

/** Soft colored light pool on the light map (drawn at half resolution). */
export function softLight(light: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = light.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(1, hexA(color, 0));
  light.fillStyle = g;
  light.fillRect(x - r, y - r, r * 2, r * 2);
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface SkylineLayer {
  canvas: HTMLCanvasElement;
  /** parallax factor: 0 = infinitely far, 1 = moves with the world */
  depth: number;
  /** drawn scale relative to the world */
  scale: number;
  /** fog color laid over it to push it back */
  base: string;
}

/** A distant skyline silhouette strip with lit windows and a few glowing signs. */
export function makeSkyline(width: number, height: number, seed: number, palette: { body: string; edge: string; lit: string[] }): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const rng = mulberry32(seed);
  let x = 0;
  while (x < width) {
    const w = 18 + Math.floor(rng() * 46);
    const h = Math.floor(height * (0.25 + rng() * 0.72));
    const top = height - h;
    px(ctx, x, top, w, h, palette.body);
    px(ctx, x, top, w, 1, palette.edge);
    if (rng() < 0.35) px(ctx, x + Math.floor(w / 2), top - 10, 1, 10, palette.edge);
    if (rng() < 0.2) {
      // stepped crown
      px(ctx, x + 4, top - 6, w - 8, 6, palette.body);
      px(ctx, x + 4, top - 6, w - 8, 1, palette.edge);
    }
    for (let wy = top + 4; wy < height - 2; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (rng() < 0.22) px(ctx, wx, wy, 2, 2, palette.lit[Math.floor(rng() * palette.lit.length)]);
      }
    }
    if (rng() < 0.12) {
      const color = NEON[Math.floor(rng() * NEON.length)];
      px(ctx, x + 2, top + 6, Math.max(4, w - 4), 3, color);
    }
    x += w + Math.floor(rng() * 4);
  }
  return c;
}
