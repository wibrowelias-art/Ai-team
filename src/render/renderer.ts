/**
 * Canvas renderer. The world is drawn at art resolution into a small buffer, then scaled up
 * with nearest-neighbour filtering (pixel-perfect). Neon parts are also drawn into an
 * emissive buffer which is blurred cheaply (downscale + bilinear upscale) for bloom.
 * Text overlays (name tags, bubbles) are drawn in screen space so they stay readable.
 */
import { findRoom, floorBase, floorTop, ROOM_DEFS, roomRect, worldHeight } from "@/game/building";
import { BUILDING_W, BUILDING_X, COLORS, SHAFT, SHAFT_CENTER_X, THEMES, WORLD_W } from "@/game/constants";
import type { BubbleIcon, GameState, Worker } from "@/game/types";
import { worldToScreen, type Camera, type View } from "./camera";
import { drawPixelText, textWidth } from "./font";
import { composeFrame, FRAME_H, FRAME_NAMES, FRAME_W, paintGrid, paletteFor, type FrameName } from "./sprites";
import { drawStatic, staticKey } from "./scene";

const BUBBLES: Record<BubbleIcon, string> = { idea: "💡", tired: "💤", paid: "💰", angry: "😡", alert: "❗", talk: "💬" };

interface Sheet {
  key: string;
  canvas: HTMLCanvasElement;
  sleep: HTMLCanvasElement;
}

interface Sign {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  seed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas not supported");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export class Renderer {
  private world = makeCanvas(WORLD_W, 100);
  private wctx = ctx2d(this.world);
  private emissive = makeCanvas(WORLD_W, 100);
  private ectx = ctx2d(this.emissive);
  private bloomA = makeCanvas(WORLD_W / 4, 25);
  private bloomActx = ctx2d(this.bloomA);
  private bloomB = makeCanvas(WORLD_W / 8, 13);
  private bloomBctx = ctx2d(this.bloomB);
  private staticColor = makeCanvas(WORLD_W, 100);
  private staticEmissive = makeCanvas(WORLD_W, 100);
  private key = "";
  private signs: Sign[] = [];
  private sheets = new Map<string, Sheet>();
  private particles: Particle[] = [];
  private height = 100;
  private lastT = 0;
  private tagWidths = new Map<string, number>();

  constructor(private fontFamily: string) {}

  get worldSize(): { w: number; h: number } {
    return { w: WORLD_W, h: this.height };
  }

  /** Rebuild cached layers when the building or theme changes. */
  private ensureStatic(g: GameState): void {
    const key = staticKey(g);
    if (key === this.key) return;
    this.key = key;
    const H = worldHeight(g.building.floors);
    this.height = H;
    for (const c of [this.world, this.emissive, this.staticColor, this.staticEmissive]) {
      c.width = WORLD_W;
      c.height = H;
    }
    this.bloomA.width = Math.ceil(WORLD_W / 4);
    this.bloomA.height = Math.ceil(H / 4);
    this.bloomB.width = Math.ceil(WORLD_W / 8);
    this.bloomB.height = Math.ceil(H / 8);
    this.wctx = ctx2d(this.world);
    this.ectx = ctx2d(this.emissive);
    this.bloomActx = ctx2d(this.bloomA);
    this.bloomBctx = ctx2d(this.bloomB);
    const sc = ctx2d(this.staticColor);
    const se = ctx2d(this.staticEmissive);
    se.clearRect(0, 0, WORLD_W, H);
    drawStatic(sc, se, g);
    this.buildSigns(g);
    this.particles = Array.from({ length: 36 }, (_, i) => ({
      x: BUILDING_X + hash(i + 1) * BUILDING_W,
      y: floorTop(0) + hash(i + 50) * (g.building.floors * 56),
      vx: (hash(i + 99) - 0.5) * 2,
      vy: -0.6 - hash(i + 7) * 1.2,
      phase: hash(i + 3) * 6.28,
    }));
  }

  private buildSigns(g: GameState): void {
    this.signs = [];
    g.building.rooms.forEach((slot, i) => {
      const def = ROOM_DEFS[slot.type];
      const r = roomRect(slot);
      const text = slot.locked ? `${def.sign}` : def.sign;
      const tw = textWidth(text);
      const c = makeCanvas(tw + 4, 9);
      const cx = ctx2d(c);
      cx.fillStyle = "#08070d";
      cx.fillRect(0, 0, c.width, c.height);
      cx.fillStyle = slot.locked ? "#2a2636" : def.color;
      cx.fillRect(0, 0, c.width, 1);
      cx.fillRect(0, c.height - 1, c.width, 1);
      cx.fillRect(0, 0, 1, c.height);
      cx.fillRect(c.width - 1, 0, 1, c.height);
      drawPixelText(cx, text, 2, 2, slot.locked ? "#3a3650" : def.color);
      const sx = Math.round(r.x + (r.w - c.width) / 2);
      this.signs.push({ canvas: c, x: sx, y: r.y + 1, seed: slot.locked ? -1 : i * 13 + 5 });
      // Level pips for upgraded rooms: a small column in the room's top-left corner.
      if (!slot.locked && slot.level > 1) {
        const pc = makeCanvas(2, slot.level * 2 - 1);
        const pctx = ctx2d(pc);
        pctx.fillStyle = COLORS.yellow;
        for (let k = 0; k < slot.level; k++) pctx.fillRect(0, k * 2, 2, 1);
        this.signs.push({ canvas: pc, x: r.x + 2, y: r.y + 2, seed: i * 13 + 6 });
      }
    });
    // Rooftop billboard
    const theme = THEMES[g.company.theme];
    const name = g.company.name.toUpperCase().slice(0, 18);
    const scale = textWidth(name, 2) <= BUILDING_W - 40 ? 2 : 1;
    const tw = textWidth(name, scale);
    const c = makeCanvas(tw + 10, 5 * scale + 8);
    const cx = ctx2d(c);
    cx.fillStyle = "#08070d";
    cx.fillRect(0, 0, c.width, c.height);
    cx.fillStyle = theme.trim;
    cx.fillRect(1, 1, c.width - 2, 1);
    cx.fillRect(1, c.height - 2, c.width - 2, 1);
    cx.fillRect(1, 1, 1, c.height - 2);
    cx.fillRect(c.width - 2, 1, 1, c.height - 2);
    drawPixelText(cx, name, 5, 4, theme.trim, scale);
    const top = floorTop(0);
    const x = Math.round(BUILDING_X + (BUILDING_W - c.width) / 2);
    const y = top - c.height - 12;
    const sc = ctx2d(this.staticColor);
    sc.fillStyle = "#3a3450";
    sc.fillRect(x + 6, y + c.height, 2, top - y - c.height);
    sc.fillRect(x + c.width - 8, y + c.height, 2, top - y - c.height);
    this.signs.push({ canvas: c, x, y, seed: 999 });
  }

  private sheet(w: Worker): Sheet {
    const key = JSON.stringify(w.look);
    const cached = this.sheets.get(w.id);
    if (cached && cached.key === key) return cached;
    const pal = paletteFor(w.look);
    const canvas = makeCanvas(FRAME_W * FRAME_NAMES.length, FRAME_H * 2);
    const c = ctx2d(canvas);
    FRAME_NAMES.forEach((f, i) => {
      const grid = composeFrame(w.look, f);
      paintGrid(c, grid, pal, i * FRAME_W, 0, false);
      paintGrid(c, grid, pal, i * FRAME_W, FRAME_H, true);
    });
    // Lying down: rotate the idle frame so the head points left and the face up.
    const idle = composeFrame(w.look, "idle0");
    const lying: string[] = [];
    for (let y = 0; y < FRAME_W; y++) {
      let row = "";
      for (let x = 0; x < FRAME_H; x++) row += idle[x][FRAME_W - 1 - y];
      lying.push(row);
    }
    const sleep = makeCanvas(FRAME_H, FRAME_W * 2);
    const sctx = ctx2d(sleep);
    paintGrid(sctx, lying, pal, 0, 0, false);
    paintGrid(sctx, lying, pal, 0, FRAME_W, true);
    const s = { key, canvas, sleep };
    this.sheets.set(w.id, s);
    return s;
  }

  /** Get a small portrait canvas (idle frame) for UI use. */
  portrait(w: Worker): HTMLCanvasElement {
    return this.sheet(w).canvas;
  }

  render(
    main: CanvasRenderingContext2D,
    g: GameState,
    cam: Camera,
    view: View,
    dpr: number,
    t: number,
    selectedId: string | null,
    /** 2 = full bloom, 1 = single bloom pass, 0 = no bloom and no dust */
    quality: 0 | 1 | 2 = 2,
  ): void {
    this.ensureStatic(g);
    const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    const W = WORLD_W;
    const H = this.height;
    const wctx = this.wctx;
    const ectx = this.ectx;

    wctx.drawImage(this.staticColor, 0, 0);
    ectx.clearRect(0, 0, W, H);
    ectx.drawImage(this.staticEmissive, 0, 0);

    this.drawSigns(t);
    this.drawBlinkers(g, t);

    // Workers (riders inside elevator pods are drawn with their pod)
    const sorted = [...g.workers].sort((a, b) => a.floor - b.floor || a.x - b.x);
    for (const w of sorted) this.drawWorker(w, g, t);

    if (quality > 0) this.drawParticles(dt, H);

    // ---- composite to screen
    main.setTransform(dpr, 0, 0, dpr, 0, 0);
    main.fillStyle = COLORS.bg;
    main.fillRect(0, 0, view.w, view.h);
    const z = cam.zoom;
    const ox = Math.round((view.w / 2 - cam.x * z) * dpr) / dpr;
    const oy = Math.round((view.h / 2 - cam.y * z) * dpr) / dpr;
    main.imageSmoothingEnabled = false;
    main.drawImage(this.world, ox, oy, W * z, H * z);

    // Bloom: two cheap blur levels (one on medium quality, none on low).
    // Each full-screen pass is the most expensive thing in a frame on weak GPUs.
    if (quality > 0) {
      this.bloomActx.imageSmoothingEnabled = true;
      this.bloomActx.clearRect(0, 0, this.bloomA.width, this.bloomA.height);
      this.bloomActx.drawImage(this.emissive, 0, 0, this.bloomA.width, this.bloomA.height);
      main.imageSmoothingEnabled = true;
      main.globalCompositeOperation = "lighter";
      if (quality === 2) {
        this.bloomBctx.imageSmoothingEnabled = true;
        this.bloomBctx.clearRect(0, 0, this.bloomB.width, this.bloomB.height);
        this.bloomBctx.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);
        main.globalAlpha = 0.55;
        main.drawImage(this.bloomA, ox, oy, W * z, H * z);
        main.globalAlpha = 0.45;
        main.drawImage(this.bloomB, ox, oy, W * z, H * z);
      } else {
        main.globalAlpha = 0.8;
        main.drawImage(this.bloomA, ox, oy, W * z, H * z);
      }
      main.globalAlpha = 1;
      main.globalCompositeOperation = "source-over";
    }

    this.drawOverlays(main, g, cam, view, t, selectedId);
  }

  private drawSigns(t: number): void {
    for (const s of this.signs) {
      let alpha = 1;
      if (s.seed >= 0) {
        const tick = Math.floor(t / 70);
        const h = hash(tick * 0.37 + s.seed);
        if (h < 0.025) alpha = 0.25;
        else if (h < 0.05) alpha = 0.6;
        alpha *= 0.9 + 0.1 * Math.sin(t / 400 + s.seed);
      }
      this.wctx.drawImage(s.canvas, s.x, s.y);
      if (s.seed >= 0) {
        this.ectx.globalAlpha = alpha;
        this.ectx.drawImage(s.canvas, s.x, s.y);
        this.ectx.globalAlpha = 1;
        if (alpha < 1) {
          this.wctx.fillStyle = `rgba(8,7,13,${(1 - alpha) * 0.8})`;
          this.wctx.fillRect(s.x, s.y, s.canvas.width, s.canvas.height);
        }
      }
    }
  }

  private drawBlinkers(g: GameState, t: number): void {
    const w = this.wctx;
    const e = this.ectx;
    const px = (x: number, y: number, c: string) => {
      w.fillStyle = c;
      w.fillRect(x, y, 1, 1);
      e.fillStyle = c;
      e.fillRect(x, y, 1, 1);
    };
    // Server rack LEDs
    for (const slot of g.building.rooms) {
      if (slot.type !== "SERVER_ROOM" || slot.locked) continue;
      const r = roomRect(slot);
      const base = r.y + r.h;
      const colors = [COLORS.green, COLORS.cyan, COLORS.pink, COLORS.green];
      for (let i = 0; i < 3; i++) {
        const sx = r.x + 4 + i * 11;
        for (let row = 0; row < 9; row++) {
          for (let k = 0; k < 2; k++) {
            const id = i * 100 + row * 10 + k;
            const on = hash(Math.floor(t / (180 + (id % 7) * 60)) + id) > 0.35;
            if (on) px(sx + 2 + k * 4, base - 29 + row * 3, colors[(id + row) % colors.length]);
          }
        }
      }
    }
    // Antenna light
    if (Math.floor(t / 600) % 2 === 0) px(BUILDING_X + BUILDING_W - 14, floorTop(0) - 37, COLORS.red);
  }

  private drawWorker(wk: Worker, g: GameState, t: number): void {
    const sheet = this.sheet(wk);
    const base = floorBase(wk.floor) + wk.y;
    const riding = wk.activity === "walking" && wk.route[0]?.kind === "ride" && Math.abs(wk.x - SHAFT_CENTER_X) < 0.5;
    const x = Math.round(wk.x);
    const y = Math.round(base);

    if (riding) {
      const pw = SHAFT.w - 6;
      const px = SHAFT.x + 3;
      this.wctx.fillStyle = "rgba(10,40,60,0.85)";
      this.wctx.fillRect(px, y - 21, pw, 21);
      this.wctx.fillStyle = COLORS.cyan;
      this.ectx.fillStyle = COLORS.cyan;
      for (const [rx, ry, rw, rh] of [
        [px, y - 21, pw, 1],
        [px, y, pw, 1],
        [px, y - 21, 1, 22],
        [px + pw - 1, y - 21, 1, 22],
      ]) {
        this.wctx.fillRect(rx, ry, rw, rh);
        this.ectx.fillRect(rx, ry, rw, rh);
      }
    }

    const spot = this.spotKind(wk, g);
    const row = wk.facing === 1 ? 0 : FRAME_H;

    if (wk.activity === "resting" && spot === "couch") {
      const sy = wk.facing === 1 ? 0 : FRAME_W;
      const breathe = Math.floor(t / 900) % 2;
      this.wctx.drawImage(sheet.sleep, 0, sy, FRAME_H, FRAME_W, x - 8, y - 15 - breathe * 0, FRAME_H, FRAME_W);
      return;
    }

    let frame: FrameName = "idle0";
    let dx = 0;
    let dy = 0;
    if (wk.bubble?.icon === "paid") {
      frame = Math.floor(t / 220) % 2 === 0 ? "cheer0" : "cheer1";
    } else if (wk.activity === "walking" && !riding) {
      frame = (["walk0", "walk1", "walk2", "walk3"] as const)[Math.floor(t / 140) % 4];
    } else if (spot === "desk" || spot === "chair") {
      frame = wk.activity === "working" ? (Math.floor(t / 240) % 2 === 0 ? "type0" : "type1") : "type0";
    } else {
      frame = t % 3200 < 160 ? "idle1" : "idle0";
    }
    if (wk.bubble?.icon === "angry") dx = Math.round(Math.sin(t / 30));
    if (wk.activity === "resting" && spot === "pool" && Math.floor(t / 1500) % 3 === 0) dy = -1;

    const fi = FRAME_NAMES.indexOf(frame);
    this.wctx.drawImage(sheet.canvas, fi * FRAME_W, row, FRAME_W, FRAME_H, x - 6 + dx, y - FRAME_H + dy, FRAME_W, FRAME_H);

    if (wk.activity === "resting" && spot === "pool") {
      // pool cue
      this.wctx.fillStyle = "#c89a5a";
      const dir = wk.facing;
      for (let i = 0; i < 9; i++) this.wctx.fillRect(x + dir * (3 + i), y - 7 + Math.floor(i / 3), 1, 1);
    }
  }

  private spotKind(w: Worker, g: GameState): string | null {
    if (!w.target || w.activity === "walking") return null;
    const room = findRoom(g.building, w.target.roomId);
    if (!room) return null;
    return ROOM_DEFS[room.type].spots[w.target.spot]?.kind ?? null;
  }

  private drawParticles(dt: number, H: number): void {
    this.wctx.fillStyle = "rgba(220,210,255,0.22)";
    for (const p of this.particles) {
      p.phase += dt;
      p.x += (p.vx + Math.sin(p.phase) * 0.8) * dt;
      p.y += p.vy * dt;
      if (p.y < floorTop(0) + 8) p.y = H - 50;
      if (p.x < BUILDING_X + 2) p.x = BUILDING_X + BUILDING_W - 3;
      if (p.x > BUILDING_X + BUILDING_W - 2) p.x = BUILDING_X + 3;
      this.wctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, g: GameState, cam: Camera, view: View, t: number, selectedId: string | null): void {
    const z = cam.zoom;
    const tagSize = Math.round(Math.max(10, Math.min(16, z * 3.2)));
    const bubbleSize = Math.round(Math.max(12, Math.min(26, z * 5)));
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const w of g.workers) {
      const base = floorBase(w.floor) + w.y;
      const lying = w.activity === "resting" && this.spotKind(w, g) === "couch";
      const headY = lying ? base - 10 : base - FRAME_H - 1;
      const p = worldToScreen(cam, view, w.x, headY);
      if (p.x < -60 || p.x > view.w + 60 || p.y < -60 || p.y > view.h + 80) continue;
      const selected = w.id === selectedId;

      if (selected) {
        const feet = worldToScreen(cam, view, w.x, base);
        const half = 8 * z;
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 8;
        const top = feet.y - (lying ? 12 : 18) * z;
        const L = Math.max(4, 3 * z);
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [
          [feet.x - half, top, 1, 1],
          [feet.x + half, top, -1, 1],
          [feet.x - half, feet.y + z, 1, -1],
          [feet.x + half, feet.y + z, -1, -1],
        ]) {
          ctx.moveTo(cx, cy + sy * L);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + sx * L, cy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // name tag
      ctx.font = `${tagSize}px ${this.fontFamily}`;
      const label = w.name.toUpperCase();
      const k = `${label}@${tagSize}`;
      let tw = this.tagWidths.get(k);
      if (tw === undefined) {
        tw = ctx.measureText(label).width;
        this.tagWidths.set(k, tw);
      }
      const tagY = Math.round(p.y - 2);
      ctx.fillStyle = "rgba(8,7,13,0.72)";
      ctx.fillRect(Math.round(p.x - tw / 2 - 3), tagY - tagSize, Math.round(tw + 6), tagSize + 1);
      ctx.fillStyle = selected ? COLORS.cyan : COLORS.white;
      ctx.fillText(label, Math.round(p.x), tagY + 1);

      // bubble
      const icon = w.bubble?.icon ?? (lying ? "tired" : null);
      if (icon) {
        const bob = Math.sin(t / 300 + w.x) * 2;
        ctx.font = `${bubbleSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText(BUBBLES[icon], Math.round(p.x), Math.round(tagY - tagSize - 2 + bob));
      }
    }
  }
}
