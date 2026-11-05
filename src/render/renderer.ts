/**
 * 2.5D canvas renderer.
 *
 * Back to front:
 *  1. sky gradient (time of day), stars and moon          — screen space
 *  2. far and mid skyline layers with parallax + fog      — screen space
 *  3. flying cars between the skyline layers               — screen space
 *  4. the world buffer: city, street, HQ with 2.5D rooms,  — art resolution, nearest-neighbour
 *     animated signs, traffic, subway, wet-street reflections
 *  5. day wash, bloom + soft light pools                   — bilinear
 *  6. characters and elevator pods at sub-pixel positions  — smooth motion
 *  7. rain / storm / fog                                   — screen space
 *  8. name tags and bubbles                                — screen space
 *
 * Quality: 2 = everything, 1 = one bloom pass, lighter rain, 0 = no bloom/rain/far layer.
 */
import { findRoom, floorBase, floorTop, ROOM_DEFS, roomRect, worldHeight } from "@/game/building";
import { BUILDING_W, BUILDING_X, COLORS, SHAFT, SHAFT_CENTER_X, THEMES, WORLD_W } from "@/game/constants";
import { dayOf } from "@/game/time";
import type { BubbleIcon, GameState, Worker } from "@/game/types";
import { nightFactor, rainAmount, rgb, skyColors, weatherFor } from "./atmosphere";
import { worldToScreen, type Camera, type View } from "./camera";
import { makeSkyline, type Blinker } from "./city";
import { drawPixelText, textWidth } from "./font";
import { drawStatic, groundLine, laneY, staticKey, tunnelY, wallScreens } from "./scene";
import { composeFrame, FRAME_H, FRAME_NAMES, FRAME_W, paintGrid, paletteFor, WALK_CYCLE, type FrameName } from "./sprites";
import { reducedMotion } from "@/ui/motion";
import { play } from "@/lib/sound";
import { formatMoney } from "@/game/time";

const BUBBLES: Record<BubbleIcon, string> = { idea: "💡", tired: "💤", paid: "💰", angry: "😡", alert: "❗", talk: "💬" };

export type Quality = 0 | 1 | 2;

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

interface Car {
  x: number;
  lane: 0 | 1;
  speed: number;
  color: string;
  len: number;
}

interface Flyer {
  x: number;
  y: number;
  speed: number;
  color: string;
}

interface Layer {
  canvas: HTMLCanvasElement;
  depth: number;
  scale: number;
  fog: number;
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

const CAR_COLORS = ["#c8c8d8", "#2b7bd6", "#ff2bd6", "#ffd84a", "#1d1d28", "#39ff88", "#ff9a3c", "#9b5cff", "#e84848"];

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
  /** soft light pools, half resolution, then shrunk to bloom size */
  private lightHalf = makeCanvas(WORLD_W / 2, 50);
  private lightSmall = makeCanvas(WORLD_W / 4, 25);
  private layers: Layer[] = [];
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private key = "";
  private signs: Sign[] = [];
  private blinkers: Blinker[] = [];
  private sheets = new Map<string, Sheet>();
  private particles: Particle[] = [];
  private cars: Car[] = [];
  private flyers: Flyer[] = [];
  private train: { x: number; dir: 1 | -1; active: boolean; wait: number } = { x: 0, dir: 1, active: false, wait: 8 };
  private height = 100;
  private floors = 3;
  private lastT = 0;
  private flash = 0;
  private flashColor = "#ffffff";
  private shake = 0;
  private tagWidths = new Map<string, number>();
  /** smoothed on-screen positions so motion eases instead of stepping */
  private vis = new Map<string, { x: number; y: number; vx: number; vy: number; facing: 1 | -1; lookUntil: number; stretchUntil: number }>();
  private fives = new Map<string, number>();
  private fiveUntil = new Map<string, number>();
  private doors = new Map<number, number>();
  private coins: { x: number; y: number; tx: number; ty: number; t: number; dur: number; color: string }[] = [];
  private floaters: { x: number; y: number; text: string; color: string; t: number }[] = [];
  private prevRevenue = -1;
  private prevSpent = -1;
  private prevPaid = new Set<string>();
  private prevEvents = new Set<string>();
  private anchor: { x: number; y: number } | null = null;
  private reduced = reducedMotion();

  /** Screen point coins fly to/from (the HUD cash counter). */
  setAnchor(p: { x: number; y: number } | null): void {
    this.anchor = p;
  }

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
    this.floors = g.building.floors;
    for (const c of [this.world, this.emissive, this.staticColor, this.staticEmissive]) {
      c.width = WORLD_W;
      c.height = H;
    }
    this.bloomA.width = this.lightSmall.width = Math.ceil(WORLD_W / 4);
    this.bloomA.height = this.lightSmall.height = Math.ceil(H / 4);
    this.bloomB.width = Math.ceil(WORLD_W / 8);
    this.bloomB.height = Math.ceil(H / 8);
    this.lightHalf.width = Math.ceil(WORLD_W / 2);
    this.lightHalf.height = Math.ceil(H / 2);
    this.wctx = ctx2d(this.world);
    this.ectx = ctx2d(this.emissive);
    this.bloomActx = ctx2d(this.bloomA);
    this.bloomBctx = ctx2d(this.bloomB);
    const sc = ctx2d(this.staticColor);
    const se = ctx2d(this.staticEmissive);
    const lh = this.lightHalf.getContext("2d")!;
    se.clearRect(0, 0, WORLD_W, H);
    lh.clearRect(0, 0, this.lightHalf.width, this.lightHalf.height);
    lh.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this.blinkers = drawStatic(sc, se, lh, g).blinkers;
    lh.setTransform(1, 0, 0, 1, 0, 0);
    const ls = this.lightSmall.getContext("2d")!;
    ls.imageSmoothingEnabled = true;
    ls.clearRect(0, 0, this.lightSmall.width, this.lightSmall.height);
    ls.drawImage(this.lightHalf, 0, 0, this.lightSmall.width, this.lightSmall.height);
    this.buildSigns(g);
    this.particles = Array.from({ length: 48 }, (_, i) => ({
      x: BUILDING_X + hash(i + 1) * BUILDING_W,
      y: floorTop(0) + hash(i + 50) * (g.building.floors * 56),
      vx: (hash(i + 99) - 0.5) * 2,
      vy: -0.6 - hash(i + 7) * 1.2,
      phase: hash(i + 3) * 6.28,
    }));
    if (this.layers.length === 0) this.buildBackdrop();
  }

  /** Distant skyline layers and stars. Built once. */
  private buildBackdrop(): void {
    this.layers = [
      {
        canvas: makeSkyline(1900, 440, 11, { body: "#0f0d1e", edge: "#1c1a34", lit: ["#3a3670", "#2e2a58", "#4a3e7a"] }),
        depth: 0.15,
        scale: 0.55,
        fog: 0.5,
      },
      {
        canvas: makeSkyline(1500, 380, 22, { body: "#15112a", edge: "#2a2448", lit: ["#7a6a48", "#4a6a8a", "#8a4a7a", "#5a5a9a"] }),
        depth: 0.4,
        scale: 0.78,
        fog: 0.25,
      },
    ];
    this.stars = Array.from({ length: 110 }, (_, i) => ({ x: hash(i * 3 + 1), y: hash(i * 7 + 2) * 0.62, s: hash(i + 9) < 0.15 ? 2 : 1, p: hash(i + 33) * 6.28 }));
  }

  private buildSigns(g: GameState): void {
    this.signs = [];
    g.building.rooms.forEach((slot, i) => {
      const def = ROOM_DEFS[slot.type];
      const r = roomRect(slot);
      const text = def.sign;
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
      if (!slot.locked && slot.level > 1) {
        const pc = makeCanvas(2, slot.level * 2 - 1);
        const pctx = ctx2d(pc);
        pctx.fillStyle = COLORS.yellow;
        for (let k = 0; k < slot.level; k++) pctx.fillRect(0, k * 2, 2, 1);
        this.signs.push({ canvas: pc, x: r.x + 6, y: r.y + 5, seed: i * 13 + 6 });
      }
    });
    // Rooftop billboard
    const theme = THEMES[g.company.theme];
    const name = g.company.name.toUpperCase().slice(0, 18);
    const scale = textWidth(name, 2) <= BUILDING_W - 60 ? 2 : 1;
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
    const y = top - c.height - 14;
    const sc = ctx2d(this.staticColor);
    sc.fillStyle = "#3a3450";
    sc.fillRect(x + 6, y + c.height, 2, top - y - c.height - 4);
    sc.fillRect(x + c.width - 8, y + c.height, 2, top - y - c.height - 4);
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
    quality: Quality = 2,
  ): void {
    this.ensureStatic(g);
    const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    const W = WORLD_W;
    const H = this.height;
    const z = cam.zoom;
    const night = nightFactor(g.minutes);
    const sky = skyColors(g.minutes);
    const weather = weatherFor(dayOf(g.minutes));
    const rain = rainAmount(weather);
    const groundY = groundLine(this.floors);

    // ---- world buffer
    const wctx = this.wctx;
    const ectx = this.ectx;
    wctx.clearRect(0, 0, W, H);
    wctx.drawImage(this.staticColor, 0, 0);
    ectx.clearRect(0, 0, W, H);
    ectx.drawImage(this.staticEmissive, 0, 0);
    this.drawSigns(t);
    this.drawBlinkers(g, t);
    if (quality > 0) this.drawScreens(g, t);
    this.updateCars(dt, quality);
    this.drawCars(night);
    this.drawTrain(dt);
    if (quality > 0) this.drawParticles(dt, H);
    if (quality > 0) this.drawReflections(groundY, rain);

    // ---- composite
    main.setTransform(dpr, 0, 0, dpr, 0, 0);
    main.globalAlpha = 1;
    main.globalCompositeOperation = "source-over";
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    this.watchGame(g, cam, view, t);
    const shakeX = this.shake > 0.01 ? (hash(t * 0.37) - 0.5) * this.shake * 14 : 0;
    const shakeY = this.shake > 0.01 ? (hash(t * 0.53 + 9) - 0.5) * this.shake * 10 : 0;
    this.shake *= Math.exp(-dt * 6);
    const ox = snap(view.w / 2 - cam.x * z + shakeX);
    const oy = snap(view.h / 2 - cam.y * z + shakeY);
    const groundScreen = oy + groundY * z;

    this.drawBackdrop(main, view, cam, dpr, sky, night, groundScreen, quality, t);
    if (quality > 0) this.drawFlyers(main, view, groundScreen, this.layers[0].canvas.height * this.layers[0].scale * z, z, dt);

    main.imageSmoothingEnabled = false;
    main.drawImage(this.world, ox, oy, W * z, H * z);

    // Daylight lifts the scene a little; at night the neon carries it.
    if (night < 1) {
      main.globalCompositeOperation = "screen";
      main.fillStyle = rgb(sky.bottom, 0.14 * (1 - night));
      main.fillRect(0, 0, view.w, view.h);
      main.globalCompositeOperation = "source-over";
    }

    if (quality > 0) {
      const strength = 0.55 + 0.45 * night;
      const b = this.bloomActx;
      b.imageSmoothingEnabled = true;
      b.globalAlpha = 1;
      b.clearRect(0, 0, this.bloomA.width, this.bloomA.height);
      b.drawImage(this.emissive, 0, 0, this.bloomA.width, this.bloomA.height);
      b.globalAlpha = 0.6 + 0.4 * night;
      b.globalCompositeOperation = "lighter";
      b.drawImage(this.lightSmall, 0, 0);
      b.globalCompositeOperation = "source-over";
      b.globalAlpha = 1;
      if (quality === 2) {
        // Second, wider glow level, folded into the small buffer so the screen gets one pass.
        this.bloomBctx.imageSmoothingEnabled = true;
        this.bloomBctx.clearRect(0, 0, this.bloomB.width, this.bloomB.height);
        this.bloomBctx.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);
        b.imageSmoothingEnabled = true;
        b.globalCompositeOperation = "lighter";
        b.globalAlpha = 0.8;
        b.drawImage(this.bloomB, 0, 0, this.bloomA.width, this.bloomA.height);
        b.globalCompositeOperation = "source-over";
        b.globalAlpha = 1;
      }
      // Draw only the on-screen part of the glow (the world is much wider than the view).
      const scale = this.bloomA.width / W;
      const vx0 = Math.max(0, -ox / z);
      const vy0 = Math.max(0, -oy / z);
      const vx1 = Math.min(W, (view.w - ox) / z);
      const vy1 = Math.min(H, (view.h - oy) / z);
      if (vx1 > vx0 && vy1 > vy0) {
        main.imageSmoothingEnabled = true;
        main.globalCompositeOperation = "lighter";
        main.globalAlpha = (quality === 2 ? 0.62 : 0.85) * strength;
        main.drawImage(
          this.bloomA,
          vx0 * scale,
          vy0 * scale,
          (vx1 - vx0) * scale,
          (vy1 - vy0) * scale,
          ox + vx0 * z,
          oy + vy0 * z,
          (vx1 - vx0) * z,
          (vy1 - vy0) * z,
        );
      }
      main.globalAlpha = 1;
      main.globalCompositeOperation = "source-over";
    }

    // Characters in screen space: they glide instead of stepping a whole art pixel at a time.
    main.imageSmoothingEnabled = false;
    const camX = cam.x - shakeX / z;
    const camY = cam.y - shakeY / z;
    const shakenCam = { x: camX, y: camY, zoom: z };
    this.drawDoors(main, g, shakenCam, view, snap, dt);
    const sorted = [...g.workers].sort((a, b) => a.floor - b.floor || a.x - b.x);
    for (const w of sorted) this.drawWorker(main, w, g, t, dt, shakenCam, view, snap);

    this.drawWeather(main, view, t, dt, rain, weather, quality, z);
    this.drawFx(main, view, t, dt, z);
    if (this.flash > 0.01) {
      main.fillStyle = this.flashColor;
      main.globalAlpha = this.flash * 0.55;
      main.fillRect(0, 0, view.w, view.h);
      main.globalAlpha = 1;
      this.flash *= Math.exp(-dt * 5);
    }
    this.drawOverlays(main, g, cam, view, t, selectedId);
  }

  // ---------------------------------------------------------------- backdrop

  private drawSky(main: CanvasRenderingContext2D, view: View, cam: Camera, sky: ReturnType<typeof skyColors>, night: number, groundScreen: number): void {
    const grad = main.createLinearGradient(0, 0, 0, Math.max(1, groundScreen));
    grad.addColorStop(0, rgb(sky.top));
    grad.addColorStop(1, rgb(sky.bottom));
    main.fillStyle = grad;
    main.fillRect(0, 0, view.w, view.h);
    if (night > 0.05) {
      const shift = (cam.x / WORLD_W) * 40;
      for (const s of this.stars) {
        const a = night * (0.45 + 0.4 * Math.sin(this.lastT / 900 + s.p));
        main.fillStyle = `rgba(220,215,255,${a.toFixed(3)})`;
        const x = ((s.x * (view.w + 80) - shift) % (view.w + 80)) - 40;
        main.fillRect(Math.round(x), Math.round(s.y * groundScreen), s.s, s.s);
      }
    }
    // moon (night) / pale sun disc through the haze (day)
    const mx = view.w * 0.18 - (cam.x / WORLD_W) * 30;
    const my = Math.max(30, groundScreen * 0.16);
    const r = Math.max(10, Math.min(28, view.w * 0.035));
    const glow = main.createRadialGradient(mx, my, r * 0.4, mx, my, r * 3);
    glow.addColorStop(0, night > 0.5 ? "rgba(200,190,255,0.25)" : "rgba(255,230,210,0.25)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    main.fillStyle = glow;
    main.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6);
    main.fillStyle = night > 0.5 ? "#cfc6ff" : "rgba(255,240,225,0.75)";
    main.beginPath();
    main.arc(mx, my, r, 0, Math.PI * 2);
    main.fill();
    if (night > 0.5) {
      main.fillStyle = rgb(sky.top);
      main.beginPath();
      main.arc(mx - r * 0.45, my - r * 0.15, r * 0.9, 0, Math.PI * 2);
      main.fill();
    }
  }

  /** Skyline layers, pre-tinted with fog so each is a single draw. */
  private drawLayers(main: CanvasRenderingContext2D, view: View, cam: Camera, quality: Quality, groundScreen: number, fog: [number, number, number]): void {
    const z = cam.zoom;
    const center = WORLD_W / 2;
    main.imageSmoothingEnabled = false;
    this.layers.forEach((L, i) => {
      if (quality === 0 && i === 0) return;
      const w = L.canvas.width * L.scale * z;
      const h = L.canvas.height * L.scale * z;
      const x = view.w / 2 + (-L.canvas.width / 2) * L.scale * z + (center - cam.x) * L.depth * z;
      main.drawImage(this.tinted(L, i, fog), x, groundScreen - h, w, h);
    });
    // solid ground below the horizon so gaps between near buildings never show sky
    main.fillStyle = rgb([Math.round(fog[0] * 0.35), Math.round(fog[1] * 0.3), Math.round(fog[2] * 0.4)]);
    main.fillRect(0, groundScreen - 1, view.w, view.h - groundScreen + 1);
  }

  private tintCache: { key: string; canvas: HTMLCanvasElement }[] = [];

  private tinted(L: Layer, i: number, fog: [number, number, number]): HTMLCanvasElement {
    // Sky colors drift slowly; re-tint only when they change noticeably.
    const key = fog.map((v) => Math.round(v / 6)).join(",");
    const cached = this.tintCache[i];
    if (cached && cached.key === key) return cached.canvas;
    const c = cached?.canvas ?? makeCanvas(L.canvas.width, L.canvas.height);
    const ctx = ctx2d(c);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(L.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = rgb(fog, L.fog);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    this.tintCache[i] = { key, canvas: c };
    return c;
  }

  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = "";

  /**
   * Sky + skyline in their own canvas, redrawn only when the camera, view or sky changes
   * (stars twinkle at 4 fps). At rest this saves several full-screen passes per frame.
   */
  private drawBackdrop(
    main: CanvasRenderingContext2D,
    view: View,
    cam: Camera,
    dpr: number,
    sky: ReturnType<typeof skyColors>,
    night: number,
    groundScreen: number,
    quality: Quality,
    t: number,
  ): void {
    const key = [view.w, view.h, dpr, cam.x.toFixed(2), cam.y.toFixed(2), cam.zoom.toFixed(4), sky.top.join(), sky.bottom.join(), quality, night > 0.05 ? Math.floor(t / 250) : 0].join("|");
    if (!this.backdrop) this.backdrop = makeCanvas(1, 1);
    const b = this.backdrop;
    if (key !== this.backdropKey) {
      this.backdropKey = key;
      const W = Math.round(view.w * dpr);
      const H = Math.round(view.h * dpr);
      if (b.width !== W || b.height !== H) {
        b.width = W;
        b.height = H;
      }
      const bctx = ctx2d(b);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawSky(bctx, view, cam, sky, night, groundScreen);
      this.drawLayers(bctx, view, cam, quality, groundScreen, sky.bottom);
    }
    main.imageSmoothingEnabled = false;
    main.drawImage(b, 0, 0, view.w, view.h);
  }

  /** Flying cars drifting between the skyline layers. */
  private drawFlyers(main: CanvasRenderingContext2D, view: View, groundScreen: number, layerH: number, z: number, dt: number): void {
    if (this.flyers.length < 5 && Math.random() < dt * 0.5) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.flyers.push({
        x: dir > 0 ? -20 : view.w + 20,
        y: groundScreen - layerH * (0.45 + Math.random() * 0.5),
        speed: dir * (30 + Math.random() * 50) * Math.max(1, z * 0.6),
        color: Math.random() < 0.5 ? COLORS.cyan : COLORS.pink,
      });
    }
    this.flyers = this.flyers.filter((f) => f.x > -40 && f.x < view.w + 40);
    for (const f of this.flyers) {
      f.x += f.speed * dt;
      const s = Math.max(1, z * 0.7);
      main.fillStyle = "rgba(20,18,36,0.9)";
      main.fillRect(f.x - 4 * s, f.y - s, 8 * s, 2 * s);
      main.fillStyle = f.color;
      main.fillRect(f.speed > 0 ? f.x + 4 * s : f.x - 5 * s, f.y - s * 0.5, s, s);
      main.fillStyle = COLORS.red;
      main.fillRect(f.speed > 0 ? f.x - 5 * s : f.x + 4 * s, f.y - s * 0.5, s, s);
    }
  }

  // ---------------------------------------------------------------- world dynamics

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

  private px(x: number, y: number, c: string): void {
    this.wctx.fillStyle = c;
    this.wctx.fillRect(x, y, 1, 1);
    this.ectx.fillStyle = c;
    this.ectx.fillRect(x, y, 1, 1);
  }

  private drawBlinkers(g: GameState, t: number): void {
    for (const slot of g.building.rooms) {
      if ((slot.type !== "SERVER_ROOM" && slot.type !== "DATA_CENTER") || slot.locked) continue;
      const r = roomRect(slot);
      const base = r.y + r.h;
      const colors = slot.type === "SERVER_ROOM" ? [COLORS.green, COLORS.cyan, COLORS.pink] : [COLORS.green, COLORS.green, COLORS.yellow];
      for (let i = 0; i < 3; i++) {
        const sx = r.x + 7 + i * 10;
        for (let row = 0; row < 9; row++) {
          for (let k = 0; k < 2; k++) {
            const id = r.x + i * 100 + row * 10 + k;
            const on = hash(Math.floor(t / (180 + (id % 7) * 60)) + id) > 0.35;
            if (on) this.px(sx + 2 + k * 4, base - 30 + row * 3, colors[(id + row) % colors.length]);
          }
        }
      }
    }
    for (const b of this.blinkers) if ((t + b.phase) % b.period < b.period * 0.5) this.px(b.x, b.y, b.color);
  }

  /** Live content on the wall screens: scrolling tickers, breathing bar charts, a beating heart. */
  private drawScreens(g: GameState, t: number): void {
    const w = this.wctx;
    const e = this.ectx;
    const fill = (x: number, y: number, ww: number, hh: number, c: string, emissive = true) => {
      w.fillStyle = c;
      w.fillRect(x, y, ww, hh);
      if (emissive) {
        e.fillStyle = c;
        e.fillRect(x, y, ww, hh);
      }
    };
    for (const slot of g.building.rooms) {
      if (slot.locked) continue;
      for (const s of wallScreens(slot)) {
        const seed = s.x * 31 + s.y;
        // wipe the static picture, keep the bezel
        fill(s.x, s.y, s.w, s.h, "#07080e", false);
        e.clearRect(s.x, s.y, s.w, s.h);
        if (s.kind === "bars") {
          const n = Math.floor((s.w - 2) / 3);
          for (let i = 0; i < n; i++) {
            const k = 0.5 + 0.5 * Math.sin(t / 900 + i * 1.7 + seed);
            const h = 1 + Math.round(k * (s.h - 3));
            const live = Math.floor(t / 1100 + i) % n === 0;
            fill(s.x + 1 + i * 3, s.y + s.h - 1 - h, 2, h, live ? "#ffffff" : s.color);
          }
        } else if (s.kind === "map") {
          for (let i = 0; i < 40; i++) {
            const x = s.x + 1 + ((Math.floor(hash(i + seed) * (s.w - 2) + t / 400) % (s.w - 2) + (s.w - 2)) % (s.w - 2));
            fill(x, s.y + 1 + Math.floor(hash(i * 3 + seed) * (s.h - 2)), 1, 1, "#0d4a55", false);
          }
          for (let i = 0; i < 6; i++) {
            const on = hash(Math.floor(t / 300) + i + seed) > 0.3;
            if (on) fill(s.x + 2 + Math.floor(hash(i + 11 + seed) * (s.w - 4)), s.y + 2 + Math.floor(hash(i + 29 + seed) * (s.h - 4)), 1, 1, s.color);
          }
          const sweep = s.x + 1 + Math.floor((t / 40) % (s.w - 2));
          fill(sweep, s.y + 1, 1, s.h - 2, "rgba(34,230,255,0.35)");
        } else if (s.kind === "ticker") {
          let y = s.y + 6;
          const off = Math.floor(t / 120);
          for (let i = 0; i < s.w - 2; i++) {
            const step = hash(i + off + seed) < 0.5 ? -1 : 1;
            y = Math.max(s.y + 1, Math.min(s.y + s.h - 2, y + step));
            fill(s.x + 1 + i, y, 1, 1, (i + off) % 9 < 5 ? COLORS.green : COLORS.red);
          }
        } else if (s.kind === "dollar") {
          const k = 0.6 + 0.4 * Math.max(0, Math.sin(t / 500));
          const cx = s.x + Math.floor(s.w / 2) - 1;
          const c = `rgba(255,216,74,${k})`;
          for (const [dx, dy, ww, hh] of [
            [0, 2, 3, 1],
            [0, 4, 3, 1],
            [0, 6, 3, 1],
            [0, 2, 1, 3],
            [2, 4, 1, 3],
            [1, 1, 1, 7],
          ])
            fill(cx + dx, s.y + dy, ww, hh, c);
        } else {
          const beat = (t % 900) / 900;
          const big = beat < 0.12 || (beat > 0.2 && beat < 0.3);
          const cx = s.x + Math.floor(s.w / 2) - 3;
          const cy = s.y + 2;
          const c = big ? "#ffffff" : s.color;
          for (const [dx, dy, ww, hh] of [
            [0, 0, 2, 2],
            [3, 0, 2, 2],
            [-1, 1, 7, 2],
            [0, 3, 5, 1],
            [1, 4, 3, 1],
            [2, 5, 1, 1],
          ])
            fill(cx + dx, cy + dy, ww, hh, c);
        }
      }
    }
  }

  private updateCars(dt: number, quality: Quality): void {
    const rate = quality === 2 ? 0.45 : quality === 1 ? 0.3 : 0.15;
    for (const lane of [0, 1] as const) {
      if (Math.random() < rate * dt && this.cars.filter((c) => c.lane === lane).length < 6) {
        const dir = lane === 0 ? 1 : -1;
        const len = Math.random() < 0.15 ? 26 : 16;
        this.cars.push({
          x: dir > 0 ? -len - 4 : WORLD_W + 4,
          lane,
          speed: (24 + Math.random() * 30) * (len > 20 ? 0.7 : 1),
          color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
          len,
        });
      }
    }
    for (const c of this.cars) c.x += (c.lane === 0 ? 1 : -1) * c.speed * dt;
    this.cars = this.cars.filter((c) => c.x > -40 && c.x < WORLD_W + 40);
  }

  private drawCars(night: number): void {
    const [l0, l1] = laneY(this.floors);
    const w = this.wctx;
    const e = this.ectx;
    for (const c of this.cars) {
      const y = c.lane === 0 ? l0 : l1;
      const x = Math.round(c.x);
      const dir = c.lane === 0 ? 1 : -1;
      const front = dir > 0 ? x + c.len - 1 : x;
      const back = dir > 0 ? x : x + c.len - 1;
      // body, cabin, windows, wheels
      w.fillStyle = c.color;
      w.fillRect(x, y - 5, c.len, 3);
      w.fillStyle = "rgba(0,0,0,0.25)";
      w.fillRect(x, y - 3, c.len, 1);
      w.fillStyle = c.color;
      const cabX = dir > 0 ? x + 3 : x + Math.floor(c.len / 2) - 3;
      w.fillRect(cabX, y - 7, Math.floor(c.len / 2) + 1, 2);
      w.fillStyle = night > 0.4 ? "#ffe9b0" : "#5a7aa8";
      w.fillRect(cabX + 1, y - 7, Math.floor(c.len / 2) - 1, 1);
      w.fillStyle = "#0a0a10";
      w.fillRect(x + 2, y - 2, 3, 2);
      w.fillRect(x + c.len - 5, y - 2, 3, 2);
      // lights + headlight beam on the emissive layer
      this.px(front, y - 4, "#fff6d8");
      this.px(back, y - 4, "#ff3048");
      e.fillStyle = `rgba(255,240,200,${0.25 + 0.35 * night})`;
      for (let k = 1; k < 12; k++) {
        const bx = front + dir * k;
        e.globalAlpha = 1 - k / 12;
        e.fillRect(bx, y - 4 - Math.floor(k / 5), 1, 1 + Math.floor(k / 3));
      }
      e.globalAlpha = 1;
    }
  }

  private drawTrain(dt: number): void {
    const tr = this.train;
    const { y0 } = tunnelY(this.floors);
    const len = 150;
    if (!tr.active) {
      tr.wait -= dt;
      if (tr.wait <= 0) {
        tr.active = true;
        tr.dir = Math.random() < 0.5 ? 1 : -1;
        tr.x = tr.dir > 0 ? -len : WORLD_W;
      }
      return;
    }
    tr.x += tr.dir * 120 * dt;
    if (tr.x < -len - 10 || tr.x > WORLD_W + 10) {
      tr.active = false;
      tr.wait = 12 + Math.random() * 20;
      return;
    }
    const w = this.wctx;
    const x = Math.round(tr.x);
    w.fillStyle = "#2a2a3a";
    w.fillRect(x, y0 + 6, len, 15);
    w.fillStyle = "#3a3a4e";
    w.fillRect(x, y0 + 6, len, 1);
    for (let k = 0; k < len; k += 25) {
      w.fillStyle = "#0a0a12";
      w.fillRect(x + k, y0 + 6, 1, 15);
      for (let wi = 3; wi < 22; wi += 6) {
        w.fillStyle = "#ffe9b0";
        w.fillRect(x + k + wi, y0 + 9, 4, 4);
        this.ectx.fillStyle = "rgba(255,233,176,0.6)";
        this.ectx.fillRect(x + k + wi, y0 + 9, 4, 4);
      }
    }
    w.fillStyle = COLORS.cyan;
    w.fillRect(x, y0 + 16, len, 1);
    this.px(tr.dir > 0 ? x + len - 1 : x, y0 + 12, "#fff6d8");
  }

  /** Mirror the bottom of the scene into the road: wet-street neon reflections. */
  private drawReflections(groundY: number, rain: number): void {
    const H = 24;
    const top = groundY + 5;
    for (const [ctx, src, alpha] of [
      [this.wctx, this.world, 0.16 + rain * 0.18],
      [this.ectx, this.emissive, 0.25 + rain * 0.25],
    ] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, WORLD_W, 17);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.setTransform(1, 0, 0, -1, 0, groundY * 2 + 10);
      ctx.drawImage(src, 0, groundY - H, WORLD_W, H, 0, groundY - H, WORLD_W, H);
      ctx.restore();
    }
  }

  private drawParticles(dt: number, H: number): void {
    this.wctx.fillStyle = "rgba(220,210,255,0.22)";
    for (const p of this.particles) {
      p.phase += dt;
      p.x += (p.vx + Math.sin(p.phase) * 0.8) * dt;
      p.y += p.vy * dt;
      if (p.y < floorTop(0) + 8) p.y = H - 50;
      if (p.y > groundLine(this.floors) - 4) p.y = floorTop(0) + 10;
      if (p.x < BUILDING_X + 2) p.x = BUILDING_X + BUILDING_W - 3;
      if (p.x > BUILDING_X + BUILDING_W - 2) p.x = BUILDING_X + 3;
      this.wctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  // ---------------------------------------------------------------- characters

  /** Eased on-screen position: starts and stops softly instead of stepping with the sim. */
  private visual(wk: Worker, dt: number, t: number) {
    const base = floorBase(wk.floor) + wk.y;
    let v = this.vis.get(wk.id);
    if (!v || this.reduced || Math.abs(v.x - wk.x) > 60 || Math.abs(v.y - base) > 80) {
      v = { x: wk.x, y: base, vx: 0, vy: 0, facing: wk.facing, lookUntil: 0, stretchUntil: 0 };
      this.vis.set(wk.id, v);
      return v;
    }
    // critically damped spring toward the sim position (per axis)
    const k = 180;
    const c = 2 * Math.sqrt(k);
    const step = Math.min(dt, 0.05);
    for (const axis of ["x", "y"] as const) {
      const target = axis === "x" ? wk.x : base;
      const vel = axis === "x" ? "vx" : "vy";
      const a = -k * (v[axis] - target) - c * v[vel];
      v[vel] += a * step;
      v[axis] += v[vel] * step;
    }
    // look around when idle: flip for a moment now and then
    if (wk.activity !== "walking" && t > v.lookUntil && hash(Math.floor(t / 2500) + wk.x) < 0.12) v.lookUntil = t + 900;
    v.facing = t < v.lookUntil ? ((-wk.facing) as 1 | -1) : wk.facing;
    return v;
  }

  private drawWorker(main: CanvasRenderingContext2D, wk: Worker, g: GameState, t: number, dt: number, cam: Camera, view: View, snap: (v: number) => number): void {
    const z = cam.zoom;
    const sheet = this.sheet(wk);
    const v = this.visual(wk, dt, t);
    const base = v.y;
    const x = v.x;
    const moving = Math.abs(v.vx) > 1.5 || Math.abs(v.vy) > 1.5;
    const riding = wk.activity === "walking" && wk.route[0]?.kind === "ride" && Math.abs(wk.x - SHAFT_CENTER_X) < 0.5;
    const sx = (wx: number) => snap(view.w / 2 + (wx - cam.x) * z);
    const sy = (wy: number) => snap(view.h / 2 + (wy - cam.y) * z);
    if (sx(x) < -40 || sx(x) > view.w + 40 || sy(base) < -40 || sy(base) > view.h + 60) return;

    if (riding) {
      const px = SHAFT.x + 3;
      const pw = SHAFT.w - 6;
      const top = base - 21;
      main.fillStyle = "rgba(10,40,60,0.85)";
      main.fillRect(sx(px), sy(top), pw * z, 21 * z);
      main.fillStyle = "rgba(34,230,255,0.18)";
      main.fillRect(sx(px), sy(top), pw * z, 21 * z);
      main.strokeStyle = COLORS.cyan;
      main.lineWidth = Math.max(1, z * 0.8);
      main.shadowColor = COLORS.cyan;
      main.shadowBlur = 6;
      main.strokeRect(sx(px), sy(top), pw * z, 21 * z);
      main.shadowBlur = 0;
    }

    const spot = this.spotKind(wk, g);
    const facing = moving ? wk.facing : v.facing;
    const row = facing === 1 ? 0 : FRAME_H;

    if (wk.activity === "resting" && spot === "couch") {
      const rowS = facing === 1 ? 0 : FRAME_W;
      const breathe = Math.sin(t / 700) * 0.4;
      main.drawImage(sheet.sleep, 0, rowS, FRAME_H, FRAME_W, sx(x - 8), sy(base - 15 + breathe), FRAME_H * z, FRAME_W * z);
      return;
    }

    let frame: FrameName = "idle0";
    const dx = 0;
    let dy = 0;
    const fiving = (this.fiveUntil.get(wk.id) ?? 0) > t;
    const tired = wk.energy < 30 && wk.activity !== "resting";
    if (tired && !moving && t > v.stretchUntil - 700 && hash(Math.floor(t / 6000) + wk.x * 3) < 0.5 && t % 6000 < 700) v.stretchUntil = t + 700;
    if (wk.bubble?.icon === "paid" || fiving) frame = Math.floor(t / 220) % 2 === 0 ? "cheer0" : "cheer1";
    else if (wk.bubble?.icon === "angry") {
      // angry stomp: bent knees every other beat, with a little bounce
      frame = Math.floor(t / 180) % 2 === 0 ? "stomp" : "idle0";
      dy = Math.floor(t / 180) % 2 === 0 ? 0 : -1;
    } else if (moving && !riding) {
      const speed = Math.hypot(v.vx, v.vy);
      frame = WALK_CYCLE[Math.floor(t / Math.max(70, 160 - speed * 1.2)) % WALK_CYCLE.length];
    } else if (t < v.stretchUntil) frame = "stretch";
    else if (spot === "desk" || spot === "chair") frame = wk.activity === "working" ? (Math.floor(t / 240) % 2 === 0 ? "type0" : "type1") : "type0";
    else {
      frame = t % 3200 < 160 ? "idle1" : "idle0";
      dy = Math.sin(t / 900 + wk.x) * 0.35; // breathing
    }
    if (wk.activity === "resting" && spot === "pool" && Math.floor(t / 1500) % 3 === 0) dy = -1;

    // soft contact shadow
    main.fillStyle = "rgba(0,0,0,0.28)";
    main.fillRect(sx(x - 5), sy(base - 1), 10 * z, 1.5 * z);

    // typing: the monitor flickers brighter with each keystroke
    if (frame === "type0" || frame === "type1") {
      const glow = 0.25 + 0.2 * (Math.floor(t / 120) % 3 === 0 ? 1 : 0);
      main.fillStyle = `rgba(160,235,255,${glow})`;
      main.fillRect(sx(x + facing * 4 - 2), sy(base - 15), 6 * z, 5 * z);
    }

    const fi = FRAME_NAMES.indexOf(frame);
    main.drawImage(sheet.canvas, fi * FRAME_W, row, FRAME_W, FRAME_H, sx(x - 6 + dx), sy(base - FRAME_H + dy), FRAME_W * z, FRAME_H * z);

    if (wk.activity === "resting" && spot === "pool") {
      main.strokeStyle = "#c89a5a";
      main.lineWidth = Math.max(1, z);
      main.beginPath();
      main.moveTo(sx(x + facing * 3), sy(base - 7));
      main.lineTo(sx(x + facing * 12), sy(base - 4));
      main.stroke();
    }
  }

  /** Friends who end up next to each other high-five (once per pair per while). */
  private checkHighFives(g: GameState, t: number): void {
    for (let i = 0; i < g.workers.length; i++) {
      for (let j = i + 1; j < g.workers.length; j++) {
        const a = g.workers[i];
        const b = g.workers[j];
        if (a.floor !== b.floor || a.activity === "walking" || b.activity === "walking") continue;
        if (Math.abs(a.x - b.x) > 11 || (a.relationships[b.id] ?? 0) < 20) continue;
        const key = `${a.id}|${b.id}`;
        if ((this.fives.get(key) ?? -1e9) > t - 45000) continue;
        this.fives.set(key, t);
        this.fiveUntil.set(a.id, t + 800);
        this.fiveUntil.set(b.id, t + 800);
      }
    }
  }

  /** Elevator doors at each stop: they slide open when a pod is there, else stay shut. */
  private drawDoors(main: CanvasRenderingContext2D, g: GameState, cam: Camera, view: View, snap: (v: number) => number, dt: number): void {
    const z = cam.zoom;
    const sx = (wx: number) => snap(view.w / 2 + (wx - cam.x) * z);
    const sy = (wy: number) => snap(view.h / 2 + (wy - cam.y) * z);
    for (let f = 0; f < g.building.floors; f++) {
      const base = floorBase(f);
      const podHere = g.workers.some((w) => w.floor === f && Math.abs(w.y) < 2 && Math.abs(w.x - SHAFT_CENTER_X) < 6 && (w.activity === "walking" || w.route.length > 0));
      const cur = this.doors.get(f) ?? 0;
      const goal = podHere ? 1 : 0;
      const next = this.reduced ? goal : cur + (goal - cur) * (1 - Math.exp(-dt * 7));
      this.doors.set(f, next);
      const open = next * 6;
      const left = SHAFT.x + 3;
      const right = SHAFT.x + SHAFT.w - 3;
      const top = base - 20;
      main.fillStyle = "rgba(30,58,74,0.92)";
      main.fillRect(sx(left), sy(top), Math.max(0, 7 - open) * z, 20 * z);
      main.fillRect(sx(right - 7 + open), sy(top), Math.max(0, 7 - open) * z, 20 * z);
      main.fillStyle = "rgba(120,200,220,0.35)";
      main.fillRect(sx(left + 6 - open), sy(top), 1 * z, 20 * z);
      main.fillRect(sx(right - 7 + open), sy(top), 1 * z, 20 * z);
    }
  }

  /** Watch the game for things worth a coin, a floater, a flash or a shake. */
  private watchGame(g: GameState, cam: Camera, view: View, t: number): void {
    this.checkHighFives(g, t);
    const z = cam.zoom;
    const toScreen = (wx: number, wy: number) => ({ x: view.w / 2 + (wx - cam.x) * z, y: view.h / 2 + (wy - cam.y) * z });
    const anchor = this.anchor ?? { x: view.w * 0.1, y: 24 };
    const revenue = Math.round(g.totalRevenue);
    if (this.prevRevenue >= 0 && revenue > this.prevRevenue + 1 && !this.reduced) {
      const gained = revenue - this.prevRevenue;
      const earners = g.workers.filter((w) => w.activity === "working").slice(0, 6);
      for (const w of earners) {
        const p = toScreen(w.x, floorBase(w.floor) - 14);
        this.coins.push({ x: p.x, y: p.y, tx: anchor.x, ty: anchor.y, t: 0, dur: 0.7 + Math.random() * 0.3, color: COLORS.yellow });
      }
      const mid = toScreen(BUILDING_X + BUILDING_W / 2, floorTop(0) - 30);
      this.floaters.push({ x: Math.min(view.w - 40, Math.max(40, mid.x)), y: Math.min(view.h - 80, Math.max(90, mid.y)), text: `+${formatMoney(gained)}`, color: COLORS.green, t: 0 });
      play("register");
    }
    this.prevRevenue = revenue;
    const spent = Math.round(g.totalSpent);
    for (const w of g.workers) {
      const paid = w.bubble?.icon === "paid";
      if (paid && !this.prevPaid.has(w.id) && !this.reduced) {
        const p = toScreen(w.x, floorBase(w.floor) - 10);
        for (let i = 0; i < 8; i++) this.coins.push({ x: anchor.x, y: anchor.y, tx: p.x + (Math.random() - 0.5) * 12, ty: p.y, t: -i * 0.05, dur: 0.6, color: COLORS.yellow });
        if (this.prevSpent >= 0 && spent > this.prevSpent) this.floaters.push({ x: p.x, y: p.y - 10, text: `-${formatMoney(spent - this.prevSpent)}`, color: COLORS.red, t: 0 });
      }
      if (paid) this.prevPaid.add(w.id);
      else this.prevPaid.delete(w.id);
    }
    this.prevSpent = spent;
    for (const ev of g.pendingEvents) {
      if (this.prevEvents.has(ev.id)) continue;
      this.prevEvents.add(ev.id);
      if (this.reduced) continue;
      if (ev.kind === "viral") {
        this.flash = 1;
        this.flashColor = COLORS.pink;
        this.shake = 0.5;
      } else if (ev.kind === "outage") {
        this.flash = 1;
        this.flashColor = COLORS.red;
        this.shake = 1;
      }
    }
    if (this.prevEvents.size > 50) this.prevEvents = new Set(g.pendingEvents.map((e) => e.id));
  }

  /** Coins and floating numbers, drawn in screen space. */
  private drawFx(main: CanvasRenderingContext2D, view: View, t: number, dt: number, z: number): void {
    if (this.coins.length) {
      main.fillStyle = COLORS.yellow;
      main.shadowColor = COLORS.yellow;
      main.shadowBlur = 6;
      const r = Math.max(2, z * 0.9);
      this.coins = this.coins.filter((c) => {
        c.t += dt;
        if (c.t < 0) return true;
        const k = Math.min(1, c.t / c.dur);
        const e = k * k * (3 - 2 * k);
        const arc = Math.sin(k * Math.PI) * 40;
        const x = c.x + (c.tx - c.x) * e;
        const y = c.y + (c.ty - c.y) * e - arc;
        main.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
        return k < 1;
      });
      main.shadowBlur = 0;
    }
    if (this.floaters.length) {
      main.textAlign = "center";
      main.textBaseline = "bottom";
      const size = Math.round(Math.max(14, Math.min(22, z * 4)));
      main.font = `${size}px ${this.fontFamily}`;
      this.floaters = this.floaters.filter((f) => {
        f.t += dt;
        const k = f.t / 1.3;
        main.globalAlpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.5) / 0.5);
        main.fillStyle = "rgba(7,7,13,0.7)";
        const w = main.measureText(f.text).width;
        main.fillRect(Math.round(f.x - w / 2 - 4), Math.round(f.y - k * 44 - size), Math.round(w + 8), size + 2);
        main.fillStyle = f.color;
        main.fillText(f.text, Math.round(f.x), Math.round(f.y - k * 44));
        return k < 1;
      });
      main.globalAlpha = 1;
    }
  }

  private spotKind(w: Worker, g: GameState): string | null {
    if (!w.target || w.activity === "walking") return null;
    const room = findRoom(g.building, w.target.roomId);
    if (!room) return null;
    return ROOM_DEFS[room.type].spots[w.target.spot]?.kind ?? null;
  }

  // ---------------------------------------------------------------- weather

  private drawWeather(main: CanvasRenderingContext2D, view: View, t: number, dt: number, rain: number, weather: string, quality: Quality, z: number): void {
    if (weather === "fog") {
      const g = main.createLinearGradient(0, view.h * 0.35, 0, view.h);
      g.addColorStop(0, "rgba(120,110,160,0)");
      g.addColorStop(1, "rgba(120,110,160,0.28)");
      main.fillStyle = g;
      main.fillRect(0, 0, view.w, view.h);
    }
    if (rain <= 0 || quality === 0) return;
    const n = Math.round((quality === 2 ? 220 : 110) * rain * Math.min(1.6, (view.w * view.h) / 400000));
    const len = Math.max(8, z * 4);
    main.strokeStyle = `rgba(180,200,255,${0.22 + rain * 0.18})`;
    main.lineWidth = 1;
    main.beginPath();
    const fall = t / 1000;
    for (let i = 0; i < n; i++) {
      const sp = 0.9 + hash(i + 5) * 0.6;
      const x = ((hash(i) * (view.w + 60) + fall * 60 * sp) % (view.w + 60)) - 30;
      const y = ((hash(i + 77) * (view.h + 40) + fall * 900 * sp) % (view.h + 40)) - 20;
      main.moveTo(x, y);
      main.lineTo(x - len * 0.18, y + len);
    }
    main.stroke();
    if (weather === "storm") {
      if (this.flash <= 0 && Math.random() < dt * 0.08) this.flash = 0.35;
      if (this.flash > 0) {
        main.fillStyle = `rgba(220,215,255,${this.flash * 0.5})`;
        main.fillRect(0, 0, view.w, view.h);
        this.flash -= dt * 1.6;
      }
    }
  }

  // ---------------------------------------------------------------- overlays

  private drawOverlays(ctx: CanvasRenderingContext2D, g: GameState, cam: Camera, view: View, t: number, selectedId: string | null): void {
    const z = cam.zoom;
    const tagSize = Math.round(Math.max(10, Math.min(16, z * 3.2)));
    const bubbleSize = Math.round(Math.max(12, Math.min(26, z * 5)));
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const w of [...g.workers].sort((a, b) => a.x - b.x)) {
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

      ctx.font = `${tagSize}px ${this.fontFamily}`;
      const label = w.name.toUpperCase();
      const k = `${label}@${tagSize}`;
      let tw = this.tagWidths.get(k);
      if (tw === undefined) {
        tw = ctx.measureText(label).width;
        this.tagWidths.set(k, tw);
      }
      // Tags that would overlap a neighbour's tag step up until they are clear.
      let tagY = Math.round(p.y - 2);
      const left = p.x - tw / 2 - 3;
      const right = p.x + tw / 2 + 3;
      for (let guard = 0; guard < 6; guard++) {
        const hit = placed.find((r) => left < r.right && right > r.left && tagY - tagSize < r.bottom && tagY + 1 > r.top);
        if (!hit) break;
        tagY = hit.top - 3;
      }
      placed.push({ left, right, top: tagY - tagSize, bottom: tagY + 1 });
      ctx.fillStyle = "rgba(8,7,13,0.72)";
      ctx.fillRect(Math.round(p.x - tw / 2 - 3), tagY - tagSize, Math.round(tw + 6), tagSize + 1);
      ctx.fillStyle = selected ? COLORS.cyan : COLORS.white;
      ctx.fillText(label, Math.round(p.x), tagY + 1);

      const icon = w.bubble?.icon ?? (lying ? "tired" : null);
      if (icon) {
        const bob = Math.sin(t / 300 + w.x) * 2;
        ctx.font = `${bubbleSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText(BUBBLES[icon], Math.round(p.x), Math.round(tagY - tagSize - 2 + bob));
      }
    }
  }
}
