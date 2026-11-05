/** Static scene painting: sky, skyline, building shell, rooms and props. Drawn once per layout change. */
import { floorBase, floorTop, Rect, ROOM_DEFS, roomRect, shaftRect, worldHeight } from "@/game/building";
import { BUILDING_W, BUILDING_X, COLORS, COLUMNS, SHAFT, SHAFT_CENTER_X, SLAB_H, THEMES, WORLD_W } from "@/game/constants";
import { mulberry32 } from "@/game/sim";
import type { GameState, RoomSlot, Spot } from "@/game/types";

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Paint on both the color layer and the emissive (bloom) layer. */
function glow(ctx: Ctx, ectx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x, y, w, h, color);
  rect(ectx, x, y, w, h, color);
}

export function staticKey(g: GameState): string {
  return [g.company.name, g.company.theme, g.building.floors, ...g.building.rooms.map((r) => `${r.id}:${r.type}:${r.locked}:${r.level}`)].join("|");
}

export function drawStatic(ctx: Ctx, ectx: Ctx, g: GameState): void {
  const theme = THEMES[g.company.theme];
  const H = worldHeight(g.building.floors);
  const groundY = floorTop(g.building.floors) + SLAB_H;
  const rng = mulberry32(1337);

  // Sky
  const grad = ctx.createLinearGradient(0, 0, 0, groundY);
  grad.addColorStop(0, "#07060d");
  grad.addColorStop(0.6, COLORS.bg2);
  grad.addColorStop(1, "#1d1230");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_W, H);
  for (let i = 0; i < 110; i++) {
    const x = Math.floor(rng() * WORLD_W);
    const y = Math.floor(rng() * groundY * 0.6);
    rect(ctx, x, y, 1, 1, rng() < 0.2 ? "#8a86b8" : "#3a365c");
  }
  // Crescent moon
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const inMoon = dx * dx + dy * dy <= 36;
      const inShadow = (dx + 3) * (dx + 3) + (dy - 1) * (dy - 1) <= 30;
      if (inMoon && !inShadow) rect(ctx, 30 + dx, 22 + dy, 1, 1, dx > 3 ? "#c9c2ff" : "#9a92d8");
    }
  }
  // Far skyline (tall, dim) then near skyline
  const layers = [
    { color: "#13102a", top: "#1e1a38", min: 60, max: groundY - 40, lit: 0.08 },
    { color: "#120f20", top: "#221d38", min: 24, max: 90, lit: 0.16 },
  ];
  for (const L of layers) {
    let x = -4;
    while (x < WORLD_W) {
      const w = 10 + Math.floor(rng() * 20);
      const h = L.min + Math.floor(rng() * Math.max(1, L.max - L.min));
      const top = groundY - h;
      rect(ctx, x, top, w, h, L.color);
      rect(ctx, x, top, w, 1, L.top);
      if (rng() < 0.3) rect(ctx, x + Math.floor(w / 2), top - 6, 1, 6, L.top);
      for (let wy = top + 3; wy < groundY - 3; wy += 4) {
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          const r = rng();
          if (r < L.lit) rect(ctx, wx, wy, 1, 1, r < 0.012 ? COLORS.pink : r < 0.024 ? COLORS.cyan : "#2e2852");
        }
      }
      x += w + Math.floor(rng() * 4);
    }
  }

  // Ground: street, sidewalk, then layered underground
  const strata = ["#120d18", "#100b15", "#0d0912", "#0b0810", "#09070d"];
  const band = Math.ceil((H - groundY) / strata.length);
  strata.forEach((c, i) => rect(ctx, 0, groundY + i * band, WORLD_W, band, c));
  rect(ctx, 0, groundY, WORLD_W, 3, "#1b1826");
  for (let sx = 0; sx < WORLD_W; sx += 10) rect(ctx, sx, groundY + 1, 5, 1, "#4a4220");
  for (let i = 0; i < 260; i++) {
    const px = Math.floor(rng() * WORLD_W);
    const py = groundY + 5 + Math.floor(rng() * (H - groundY - 6));
    rect(ctx, px, py, 1 + Math.floor(rng() * 3), 1, rng() < 0.5 ? "#1a1322" : "#22192c");
  }
  const pipes = [
    { y: groundY + 14, glowColor: "#0f5966" },
    { y: groundY + 52, glowColor: "#5a1650" },
  ];
  for (const p of pipes) {
    rect(ctx, 0, p.y, WORLD_W, 3, "#121a26");
    glow(ctx, ectx, 0, p.y + 1, WORLD_W, 1, p.glowColor);
    for (let jx = 6; jx < WORLD_W; jx += 40) rect(ctx, jx, p.y - 1, 3, 5, "#1c2636");
  }
  // Foundation and future dig site
  rect(ctx, BUILDING_X + 6, groundY + 3, BUILDING_W - 12, 6, "#17131f");
  rect(ctx, BUILDING_X + 6, groundY + 9, 2, 30, "#141019");
  rect(ctx, BUILDING_X + BUILDING_W - 8, groundY + 9, 2, 30, "#141019");
  const digY = groundY + 72;
  for (let dx = BUILDING_X + 14; dx < BUILDING_X + BUILDING_W - 14; dx += 6) rect(ctx, dx, digY, 3, 1, "#2a2236");
  // Bedrock
  for (let bx = 0; bx < WORLD_W; bx += 7) rect(ctx, bx, H - 8 + Math.floor(rng() * 3), 5, 8, "#07050a");
  // Buried details
  rect(ctx, 40, groundY + 92, 6, 4, "#2a2030");
  rect(ctx, 41, groundY + 93, 4, 1, "#4a3a20");
  rect(ctx, 200, groundY + 86, 5, 3, "#1f1a2a");
  rect(ctx, 150, groundY + 100, 2, 2, "#2a2440");

  drawRoof(ctx);

  // Building shell
  const top = floorTop(0);
  const shellH = groundY - top;
  rect(ctx, BUILDING_X, top, BUILDING_W, shellH, "#1c1828");

  // Elevator shaft
  const sh = shaftRect(g.building.floors);
  rect(ctx, sh.x, sh.y, sh.w, sh.h, "#0a131d");
  for (let yy = sh.y; yy < sh.y + sh.h; yy += 6) rect(ctx, sh.x + 2, yy, sh.w - 4, 1, "#0e1a27");
  rect(ctx, SHAFT_CENTER_X, sh.y, 1, sh.h, "#1d3446");
  glow(ctx, ectx, sh.x + 1, sh.y, 1, sh.h, "#1aa9c0");
  glow(ctx, ectx, sh.x + sh.w - 2, sh.y, 1, sh.h, "#1aa9c0");

  for (let f = 0; f < g.building.floors; f++) {
    const base = floorBase(f);
    // door frame at each stop
    rect(ctx, sh.x + 3, base - 20, sh.w - 6, 1, "#2a4a5e");
    rect(ctx, sh.x + 3, base - 20, 1, 20, "#2a4a5e");
    rect(ctx, sh.x + sh.w - 4, base - 20, 1, 20, "#2a4a5e");
    glow(ctx, ectx, SHAFT_CENTER_X - 1, base - 23, 2, 1, COLORS.yellow);
  }

  for (const slot of g.building.rooms) drawRoom(ctx, ectx, slot, theme.wall);

  // Partition walls with doorways
  for (let f = 0; f < g.building.floors; f++) {
    const y = floorTop(f) + SLAB_H;
    const base = floorBase(f);
    for (const wx of [COLUMNS[0].x + COLUMNS[0].w, SHAFT.x + SHAFT.w, COLUMNS[2].x - 1]) {
      rect(ctx, wx, y, 1, base - y - 22, "#2a2440");
      rect(ctx, wx, base - 22, 1, 1, "#3a3358");
    }
  }

  // Slabs
  for (let f = 0; f <= g.building.floors; f++) {
    const y = floorTop(f);
    rect(ctx, BUILDING_X, y, BUILDING_W, SLAB_H, "#262036");
    rect(ctx, BUILDING_X, y, BUILDING_W, 1, "#3a3150");
    rect(ctx, BUILDING_X, y + SLAB_H - 1, BUILDING_W, 1, "#161220");
    for (let bx = BUILDING_X + 4; bx < BUILDING_X + BUILDING_W; bx += 16) rect(ctx, bx, y + 2, 1, 2, "#1d182a");
  }

  // Outer walls + neon trim
  rect(ctx, BUILDING_X, top, 2, shellH, "#2c2640");
  rect(ctx, BUILDING_X + BUILDING_W - 2, top, 2, shellH, "#2c2640");
  glow(ctx, ectx, BUILDING_X - 1, top, 1, shellH, theme.trim);
  glow(ctx, ectx, BUILDING_X + BUILDING_W, top, 1, shellH, theme.trim);
  glow(ctx, ectx, BUILDING_X - 1, top - 1, BUILDING_W + 2, 1, theme.trim);
}

function drawRoof(ctx: Ctx): void {
  const top = floorTop(0);
  // parapet + AC units
  rect(ctx, BUILDING_X, top - 3, BUILDING_W, 3, "#221d30");
  rect(ctx, BUILDING_X + 8, top - 9, 14, 6, "#2a2538");
  rect(ctx, BUILDING_X + 10, top - 7, 10, 1, "#3a3450");
  rect(ctx, BUILDING_X + 10, top - 5, 10, 1, "#3a3450");
  rect(ctx, BUILDING_X + 26, top - 7, 8, 4, "#2a2538");
  // antenna
  const ax = BUILDING_X + BUILDING_W - 14;
  rect(ctx, ax, top - 36, 1, 33, "#4a4560");
  rect(ctx, ax - 3, top - 26, 7, 1, "#4a4560");
  rect(ctx, ax - 2, top - 18, 5, 1, "#4a4560");
}

/** Pixel-art props per room type. */
function drawRoom(ctx: Ctx, ectx: Ctx, slot: RoomSlot, wall: string): void {
  const r = roomRect(slot);
  const def = ROOM_DEFS[slot.type];
  const base = r.y + r.h;

  if (slot.locked) {
    rect(ctx, r.x, r.y, r.w, r.h, "#0c0a12");
    for (let i = -r.h; i < r.w; i += 8) {
      for (let k = 0; k < 4; k++) {
        const px = r.x + i + k;
        if (px >= r.x && px < r.x + r.w) rect(ctx, px, base - 4 + (k % 2), 1, 1, k < 2 ? "#3a3210" : "#141018");
      }
    }
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2 + 2;
    rect(ctx, cx - 4, cy - 1, 9, 7, "#3a3450");
    rect(ctx, cx - 3, cy - 5, 1, 4, "#3a3450");
    rect(ctx, cx + 3, cy - 5, 1, 4, "#3a3450");
    rect(ctx, cx - 3, cy - 6, 7, 1, "#3a3450");
    rect(ctx, cx, cy + 1, 1, 3, "#0c0a12");
    // cobwebs of dust
    rect(ctx, r.x + 2, r.y + 1, 3, 1, "#1a1724");
    rect(ctx, r.x + 2, r.y + 2, 1, 2, "#1a1724");
    return;
  }

  rect(ctx, r.x, r.y, r.w, r.h, wall);
  for (let px = r.x + 6; px < r.x + r.w; px += 12) rect(ctx, px, r.y + 9, 1, r.h - 12, "#ffffff08");
  rect(ctx, r.x, r.y + r.h - 3, r.w, 3, "#00000030");
  // ceiling lamp
  glow(ctx, ectx, r.x + r.w / 2 - 4, r.y, 8, 1, "#cfc8ff");
  // neon floor strip
  glow(ctx, ectx, r.x, base - 1, r.w, 1, dim(def.color));

  const at = (s: Spot) => r.x + s.dx;
  switch (slot.type) {
    case "COMMAND": {
      drawWallScreen(ctx, ectx, { x: r.x + 6, y: r.y + 10, w: r.w - 12, h: 11 }, COLORS.cyan, "map");
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, COLORS.cyan));
      break;
    }
    case "WAR_ROOM": {
      drawWallScreen(ctx, ectx, { x: r.x + 18, y: r.y + 10, w: 36, h: 10 }, COLORS.red, "bars");
      rect(ctx, r.x + 18, base - 8, 36, 2, "#3b2c3a");
      rect(ctx, r.x + 18, base - 8, 36, 1, "#5a4256");
      rect(ctx, r.x + 22, base - 6, 1, 6, "#2a2030");
      rect(ctx, r.x + 49, base - 6, 1, 6, "#2a2030");
      glow(ctx, ectx, r.x + 34, base - 9, 4, 1, COLORS.red);
      def.spots.filter((s) => s.kind === "chair").forEach((s) => drawChair(ctx, at(s), base, s.face));
      break;
    }
    case "REVENUE_BAY": {
      drawWallScreen(ctx, ectx, { x: r.x + 6, y: r.y + 10, w: 40, h: 11 }, COLORS.green, "bars");
      drawWallScreen(ctx, ectx, { x: r.x + 50, y: r.y + 10, w: 16, h: 11 }, COLORS.yellow, "dollar");
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, COLORS.green));
      break;
    }
    case "TREASURY": {
      // vault door
      const vx = r.x + r.w - 20;
      rect(ctx, vx, r.y + 10, 16, 16, "#3a3446");
      rect(ctx, vx + 2, r.y + 12, 12, 12, "#4a4458");
      rect(ctx, vx + 7, r.y + 14, 2, 8, "#2a2436");
      rect(ctx, vx + 4, r.y + 17, 8, 2, "#2a2436");
      glow(ctx, ectx, vx + 13, r.y + 12, 1, 1, COLORS.green);
      drawWallScreen(ctx, ectx, { x: r.x + 6, y: r.y + 10, w: 26, h: 9 }, COLORS.yellow, "bars");
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, COLORS.yellow));
      break;
    }
    case "FACTORY": {
      // hanging shirts rail
      rect(ctx, r.x + 4, r.y + 10, r.w - 8, 1, "#5a5070");
      const shirtColors = [COLORS.pink, COLORS.cyan, COLORS.yellow, COLORS.green, COLORS.purple, "#ffffff"];
      for (let i = 0; i < 6; i++) drawShirt(ctx, r.x + 7 + i * 10, r.y + 11, shirtColors[i]);
      def.spots.filter((s) => s.kind === "bench").forEach((s, i) => drawBench(ctx, ectx, at(s), base, i));
      // boxes
      rect(ctx, r.x + r.w - 7, base - 6, 6, 6, "#7a5a3a");
      rect(ctx, r.x + r.w - 7, base - 4, 6, 1, "#5a402a");
      rect(ctx, r.x + r.w - 6, base - 11, 5, 5, "#8a6a48");
      break;
    }
    case "CHILL": {
      // bar shelf with neon bottles
      rect(ctx, r.x + 4, r.y + 18, 26, 1, "#4a3a50");
      for (let i = 0; i < 8; i++) {
        const c = [COLORS.pink, COLORS.cyan, COLORS.green, COLORS.yellow][i % 4];
        glow(ctx, ectx, r.x + 6 + i * 3, r.y + 15, 1, 3, c);
      }
      drawWallScreen(ctx, ectx, { x: r.x + 36, y: r.y + 10, w: 16, h: 9 }, COLORS.pink, "heart");
      // couch
      const cx = r.x + 3;
      rect(ctx, cx, base - 10, 24, 5, "#7a1f6a");
      rect(ctx, cx, base - 5, 24, 3, "#9a2a86");
      rect(ctx, cx - 1, base - 7, 2, 5, "#5a1650");
      rect(ctx, cx + 23, base - 7, 2, 5, "#5a1650");
      rect(ctx, cx + 1, base - 2, 1, 2, "#2a1028");
      rect(ctx, cx + 22, base - 2, 1, 2, "#2a1028");
      // pool table
      const px = r.x + 35;
      rect(ctx, px, base - 9, 16, 1, "#4a2a18");
      rect(ctx, px + 1, base - 8, 14, 2, "#1d7a3e");
      rect(ctx, px, base - 6, 16, 1, "#4a2a18");
      rect(ctx, px + 1, base - 5, 2, 5, "#3a2012");
      rect(ctx, px + 13, base - 5, 2, 5, "#3a2012");
      rect(ctx, px + 5, base - 10, 1, 1, "#ffffff");
      rect(ctx, px + 9, base - 10, 1, 1, COLORS.red);
      rect(ctx, px + 11, base - 10, 1, 1, COLORS.yellow);
      // arcade
      const ax = r.x + r.w - 7;
      rect(ctx, ax, base - 18, 6, 18, "#2a1d48");
      rect(ctx, ax - 1, base - 9, 2, 2, "#3a2a60");
      glow(ctx, ectx, ax + 1, base - 16, 4, 4, COLORS.cyan);
      glow(ctx, ectx, ax, base - 18, 6, 1, COLORS.purple);
      break;
    }
    case "SERVER_ROOM": {
      for (let i = 0; i < 3; i++) {
        const sx = r.x + 4 + i * 11;
        rect(ctx, sx, base - 32, 9, 32, "#15151f");
        rect(ctx, sx, base - 32, 9, 1, "#2a2a3a");
        for (let yy = base - 30; yy < base - 2; yy += 3) rect(ctx, sx + 1, yy, 7, 1, "#202030");
      }
      rect(ctx, r.x + 46, base - 9, 14, 1, "#3a3450");
      rect(ctx, r.x + 50, base - 15, 6, 5, "#1a1a26");
      glow(ctx, ectx, r.x + 51, base - 14, 4, 3, COLORS.purple);
      break;
    }
    case "MARKETING_LAB": {
      // whiteboard with sticky notes + ring light
      rect(ctx, r.x + 6, r.y + 10, 30, 13, "#d8d4e8");
      rect(ctx, r.x + 6, r.y + 23, 30, 1, "#8a84a8");
      const notes = [COLORS.yellow, COLORS.pink, COLORS.cyan, COLORS.green];
      for (let i = 0; i < 6; i++) rect(ctx, r.x + 8 + (i % 3) * 9, r.y + 12 + Math.floor(i / 3) * 5, 4, 3, notes[i % 4]);
      rect(ctx, r.x + 56, base - 26, 1, 26, "#3a3450");
      glow(ctx, ectx, r.x + 53, base - 31, 7, 1, "#fff6e0");
      glow(ctx, ectx, r.x + 53, base - 31, 1, 5, "#fff6e0");
      glow(ctx, ectx, r.x + 59, base - 31, 1, 5, "#fff6e0");
      glow(ctx, ectx, r.x + 53, base - 27, 7, 1, "#fff6e0");
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, COLORS.pink));
      break;
    }
    case "RECORDING_STUDIO": {
      // acoustic foam
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) rect(ctx, r.x + 40 + i * 7, r.y + 10 + j * 7, 6, 6, (i + j) % 2 ? "#2a1f3e" : "#33264c");
      // mixing desk with glowing faders
      rect(ctx, r.x + 6, base - 9, 26, 3, "#2a2438");
      for (let i = 0; i < 8; i++) glow(ctx, ectx, r.x + 8 + i * 3, base - 9 + (i % 3 === 0 ? 0 : 1), 1, 1, i % 2 ? COLORS.cyan : COLORS.purple);
      rect(ctx, r.x + 8, base - 6, 1, 6, "#1c1828");
      rect(ctx, r.x + 29, base - 6, 1, 6, "#1c1828");
      // mic stand
      rect(ctx, r.x + 50, base - 18, 1, 18, "#6c7488");
      rect(ctx, r.x + 48, base - 1, 5, 1, "#6c7488");
      rect(ctx, r.x + 49, base - 21, 3, 3, "#9aa3b5");
      glow(ctx, ectx, r.x + 30, r.y + 10, 6, 3, COLORS.red);
      break;
    }
    case "VAULT": {
      const cx = r.x + 22;
      const cy = r.y + 24;
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= 12) rect(ctx, cx + dx, cy + dy, 1, 1, d > 10 ? "#5a5470" : d > 4 ? "#3a3450" : "#4a4460");
        }
      rect(ctx, cx - 7, cy, 15, 1, "#6c7488");
      rect(ctx, cx, cy - 7, 1, 15, "#6c7488");
      glow(ctx, ectx, cx + 9, cy - 9, 1, 1, COLORS.green);
      // gold bars
      for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) rect(ctx, r.x + 44 + j * 7 + (2 - i) * 3, base - 4 - (2 - i) * 3, 6, 3, j % 2 ? "#e0b23a" : COLORS.yellow);
      break;
    }
    case "ROOFTOP_LOUNGE": {
      // string lights
      for (let px = r.x + 2; px < r.x + r.w - 2; px += 2) {
        const sag = Math.round(Math.sin(((px - r.x) / r.w) * Math.PI) * 4);
        rect(ctx, px, r.y + 8 + sag, 1, 1, "#3a3450");
        if ((px - r.x) % 8 === 0) glow(ctx, ectx, px, r.y + 9 + sag, 1, 1, [COLORS.yellow, COLORS.pink, COLORS.cyan][((px - r.x) / 8) % 3]);
      }
      // plants
      for (const px of [r.x + 4, r.x + r.w - 9]) {
        rect(ctx, px, base - 5, 5, 5, "#5a3a2a");
        rect(ctx, px - 1, base - 11, 7, 6, "#1d7a3e");
        rect(ctx, px + 1, base - 14, 3, 3, "#2a9a50");
      }
      // couch + bar counter
      rect(ctx, r.x + 12, base - 9, 22, 4, "#2b5b9a");
      rect(ctx, r.x + 12, base - 5, 22, 3, "#3a72b8");
      rect(ctx, r.x + 40, base - 10, 16, 2, "#5a4a6a");
      rect(ctx, r.x + 42, base - 8, 1, 8, "#3a3048");
      rect(ctx, r.x + 53, base - 8, 1, 8, "#3a3048");
      glow(ctx, ectx, r.x + 44, base - 13, 1, 3, COLORS.pink);
      glow(ctx, ectx, r.x + 48, base - 12, 1, 2, COLORS.cyan);
      break;
    }
    case "TRADING_DESK": {
      // ticker wall
      rect(ctx, r.x + 4, r.y + 9, r.w - 8, 12, "#07080e");
      const rng = mulberry32(r.x + 77);
      let y = r.y + 15;
      for (let px = r.x + 5; px < r.x + r.w - 5; px++) {
        y = Math.max(r.y + 10, Math.min(r.y + 19, y + (rng() < 0.5 ? -1 : 1)));
        glow(ctx, ectx, px, y, 1, 1, px % 9 < 5 ? COLORS.green : COLORS.red);
      }
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, COLORS.green));
      break;
    }
    default: {
      def.spots.filter((s) => s.kind === "desk").forEach((s) => drawDesk(ctx, ectx, at(s), base, def.color));
    }
  }
}

function dim(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.45);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawDesk(ctx: Ctx, ectx: Ctx, sx: number, base: number, color: string): void {
  drawChair(ctx, sx, base, 1);
  rect(ctx, sx + 4, base - 7, 13, 1, "#5a4a6a");
  rect(ctx, sx + 4, base - 6, 13, 1, "#3a3048");
  rect(ctx, sx + 15, base - 5, 1, 5, "#2e263c");
  rect(ctx, sx + 5, base - 5, 1, 5, "#2e263c");
  // monitor
  rect(ctx, sx + 9, base - 15, 7, 6, "#14121c");
  glow(ctx, ectx, sx + 10, base - 14, 5, 4, dim(color));
  rect(ctx, sx + 10, base - 13, 3, 1, color);
  rect(ctx, sx + 12, base - 9, 1, 2, "#14121c");
  // mug
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
    for (let i = 0; i < 40; i++) {
      const px = s.x + 1 + Math.floor(rng() * (s.w - 2));
      const py = s.y + 1 + Math.floor(rng() * (s.h - 2));
      rect(ctx, px, py, 1, 1, dim(color));
    }
    for (let i = 0; i < 6; i++) {
      glow(ctx, ectx, s.x + 2 + Math.floor(rng() * (s.w - 4)), s.y + 2 + Math.floor(rng() * (s.h - 4)), 1, 1, color);
    }
  } else if (kind === "dollar") {
    const cx = s.x + Math.floor(s.w / 2) - 1;
    glow(ctx, ectx, cx, s.y + 2, 3, 1, color);
    glow(ctx, ectx, cx, s.y + 4, 3, 1, color);
    glow(ctx, ectx, cx, s.y + 6, 3, 1, color);
    glow(ctx, ectx, cx, s.y + 2, 1, 3, color);
    glow(ctx, ectx, cx + 2, s.y + 4, 1, 3, color);
    glow(ctx, ectx, cx + 1, s.y + 1, 1, 7, color);
  } else {
    const cx = s.x + Math.floor(s.w / 2) - 3;
    const cy = s.y + 2;
    glow(ctx, ectx, cx, cy, 2, 2, color);
    glow(ctx, ectx, cx + 3, cy, 2, 2, color);
    glow(ctx, ectx, cx - 1, cy + 1, 7, 2, color);
    glow(ctx, ectx, cx, cy + 3, 5, 1, color);
    glow(ctx, ectx, cx + 1, cy + 4, 3, 1, color);
    glow(ctx, ectx, cx + 2, cy + 5, 1, 1, color);
  }
}
