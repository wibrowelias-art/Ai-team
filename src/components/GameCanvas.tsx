"use client";

import { useEffect, useRef } from "react";
import { buildingBand, buildingSpan, hitRoom, worldHeight } from "@/game/building";
import { WORLD_W } from "@/game/constants";
import { useGame } from "@/game/store";
import { clampCamera, initialCamera, MAX_ZOOM, panBy, screenToWorld, zoomAt, type Camera, type View } from "@/render/camera";
import { workerAt } from "@/render/hit";
import { Renderer, type Quality } from "@/render/renderer";
import { groundLine } from "@/render/scene";
import { FRAME_H } from "@/render/sprites";

/** Workers should be at least this tall on a phone at the default zoom. */
const MIN_WORKER_PX = 40;

const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320;

function pixelFont(): string {
  if (typeof window === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-vt323").trim();
  return v ? `${v}, monospace` : "monospace";
}

export interface Insets {
  top: number;
  bottom: number;
}

/**
 * Full-screen game canvas. The HUD and bottom bar float on top; `insets` tells the camera how
 * much of the view they cover so framing and fly-to targets stay in the visible area.
 */
export default function GameCanvas({ insets = { top: 0, bottom: 0 } }: { insets?: Insets }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const insetsRef = useRef(insets);
  const reframeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    insetsRef.current = insets;
    reframeRef.current?.();
  }, [insets]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const renderer = new Renderer(pixelFont());
    let view: View = { w: 1, h: 1 };
    let dpr = 1;
    let cam: Camera | null = null;
    let target: { x: number; y: number } | null = null;
    let lastFocus = useGame.getState().focus?.n ?? 0;
    // smooth zoom (wheel, double tap, keys): ease toward zoomGoal around an anchor
    let zoomGoal: { zoom: number; ax: number; ay: number } | null = null;
    // momentum after a drag (screen px per second)
    let vel = { x: 0, y: 0 };
    let floorsSeen = useGame.getState().game?.building.floors ?? 3;

    const floors = () => useGame.getState().game?.building.floors ?? 3;
    const worldSize = () => ({ w: WORLD_W, h: worldHeight(floors()) });
    /**
     * Default framing. Phones: zoom so workers are at least ~40 px tall, anchored on the street
     * floors where the crew starts. Wide screens: the whole tower.
     */
    const frame = () => {
      const fit = initialCamera(view, worldSize(), buildingBand(floors()), buildingSpan(), insetsRef.current);
      const minZoom = MIN_WORKER_PX / FRAME_H;
      if (view.w >= 768 || fit.zoom >= minZoom) return fit;
      const ins = insetsRef.current;
      const visibleBottom = view.h - ins.bottom;
      const groundY = groundLine(floors()) + 12;
      // Put the street a little above the bottom bar and center on the building.
      const y = groundY - (visibleBottom - view.h / 2) / minZoom;
      const span = buildingSpan();
      return clampCamera({ x: (span.x0 + span.x1) / 2, y, zoom: minZoom }, view, worldSize());
    };

    // Graphics quality: 2 high, 1 medium, 0 low. "auto" starts high and steps down when frames are slow.
    const fixedQuality = (): Quality | null => {
      const gfx = useGame.getState().game?.settings.graphics ?? "auto";
      return gfx === "high" ? 2 : gfx === "low" ? 0 : null;
    };
    let quality: Quality = fixedQuality() ?? 2;
    const maxDpr = (q: Quality) => (q === 2 ? 2 : q === 1 ? 1.5 : 1);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      dpr = Math.min(maxDpr(quality), window.devicePixelRatio || 1);
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      canvas.style.width = `${view.w}px`;
      canvas.style.height = `${view.h}px`;
      cam = cam ? clampCamera(cam, view, worldSize()) : frame();
    };
    // Until the player touches the camera, keep the building framed (e.g. once HUD sizes are known).
    let interacted = false;
    reframeRef.current = () => {
      if (!interacted) cam = frame();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // ---- input
    const pointers = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number; t: number } | null = null;
    let lastTap: { x: number; y: number; t: number; hit: boolean } | null = null;
    let pinchDist = 0;
    let pinchMid = { x: 0, y: 0 };
    let samples: { x: number; y: number; t: number }[] = [];

    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const twoPointer = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      target = null;
      zoomGoal = null;
      interacted = true;
      vel = { x: 0, y: 0 };
      samples = [{ ...p, t: performance.now() }];
      if (pointers.size === 1) tap = { ...p, t: performance.now() };
      else {
        tap = null;
        const tp = twoPointer();
        pinchDist = tp.dist;
        pinchMid = tp.mid;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !cam) return;
      const p = local(e);
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > TAP_SLOP) tap = null;
        if (!tap) {
          cam = panBy(cam, view, worldSize(), p.x - prev.x, p.y - prev.y);
          const now = performance.now();
          samples.push({ ...p, t: now });
          samples = samples.filter((s) => now - s.t < 100);
        }
      } else if (pointers.size === 2) {
        const tp = twoPointer();
        if (pinchDist > 0) cam = zoomAt(cam, view, worldSize(), tp.dist / pinchDist, tp.mid.x, tp.mid.y);
        cam = panBy(cam, view, worldSize(), tp.mid.x - pinchMid.x, tp.mid.y - pinchMid.y);
        pinchDist = tp.dist;
        pinchMid = tp.mid;
      }
    };

    const onUp = (e: PointerEvent) => {
      const wasTap = tap && pointers.size === 1 && performance.now() - tap.t < 500;
      // fling: keep gliding with the release velocity
      if (pointers.size === 1 && !wasTap && samples.length > 1) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const ms = Math.max(1, b.t - a.t);
        vel = { x: ((b.x - a.x) / ms) * 1000, y: ((b.y - a.y) / ms) * 1000 };
      }
      pointers.delete(e.pointerId);
      if (pointers.size === 2) {
        const tp = twoPointer();
        pinchDist = tp.dist;
        pinchMid = tp.mid;
      }
      if (wasTap && cam) handleTap(local(e));
      if (pointers.size === 0) tap = null;
    };

    const zoomTo = (zoom: number, ax: number, ay: number) => {
      zoomGoal = { zoom: Math.max(0.1, Math.min(MAX_ZOOM, zoom)), ax, ay };
    };

    const handleTap = (p: { x: number; y: number }) => {
      const st = useGame.getState();
      const g = st.game;
      if (!g || !cam) return;
      const now = performance.now();
      const w = screenToWorld(cam, view, p.x, p.y);
      const pad = Math.max(3, 14 / cam.zoom);
      const worker = workerAt(g.workers, w.x, w.y, pad);
      const room = worker ? undefined : hitRoom(g.building, w.x, w.y);
      // Double tap on empty space (sky, street, city): zoom in there, or back out.
      const isDouble = lastTap && !lastTap.hit && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
      lastTap = { ...p, t: now, hit: !!(worker || room) };
      if (!worker && !room && isDouble) {
        const whole = initialCamera(view, worldSize(), buildingBand(floors()), buildingSpan(), insetsRef.current);
        const close = frame();
        if (cam.zoom > whole.zoom * 1.2) {
          target = { x: whole.x, y: whole.y };
          zoomTo(whole.zoom, view.w / 2, view.h / 2);
        } else {
          zoomTo(Math.max(close.zoom, whole.zoom * 2.2), p.x, p.y);
        }
        lastTap = null;
        return;
      }
      if (worker) {
        st.openPanel({ id: "worker", ref: worker.id });
        st.selectWorker(worker.id);
        return;
      }
      if (room) {
        st.openPanel({ id: "room", ref: room.id });
        return;
      }
      st.openPanel(null);
      st.selectWorker(null);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cam) return;
      interacted = true;
      const p = local(e);
      const base = zoomGoal?.zoom ?? cam.zoom;
      // trackpad pinch sends ctrl+wheel with small deltas; mice send big steps
      const k = e.ctrlKey ? 0.01 : 0.0018;
      zoomTo(base * Math.exp(-e.deltaY * k), p.x, p.y);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!cam || (e.target as HTMLElement)?.closest?.("input, textarea, select, [role=dialog]")) return;
      const step = 60;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (vel = { x: step * 8, y: 0 }),
        ArrowRight: () => (vel = { x: -step * 8, y: 0 }),
        ArrowUp: () => (vel = { x: 0, y: step * 8 }),
        ArrowDown: () => (vel = { x: 0, y: -step * 8 }),
        "+": () => zoomTo((zoomGoal?.zoom ?? cam!.zoom) * 1.25, view.w / 2, view.h / 2),
        "=": () => zoomTo((zoomGoal?.zoom ?? cam!.zoom) * 1.25, view.w / 2, view.h / 2),
        "-": () => zoomTo((zoomGoal?.zoom ?? cam!.zoom) / 1.25, view.w / 2, view.h / 2),
        "0": () => {
          const f = frame();
          target = { x: f.x, y: f.y };
          zoomTo(f.zoom, view.w / 2, view.h / 2);
        },
      };
      const fn = keys[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);

    // ---- loop
    let raf = 0;
    let last = performance.now();
    let frameSum = 0;
    let frameCount = 0;
    let holdUntil = 0;
    const setQuality = (q: Quality) => {
      if (q === quality) return;
      quality = q;
      resize();
      useGame.setState({ renderQuality: q });
    };
    useGame.setState({ renderQuality: quality });
    const adapt = (frameMs: number, t: number) => {
      const fixed = fixedQuality();
      if (fixed !== null) return setQuality(fixed);
      if (frameMs > 250) return;
      frameSum += frameMs;
      frameCount += 1;
      if (frameCount < 60) return;
      const avg = frameSum / frameCount;
      frameSum = 0;
      frameCount = 0;
      if (avg > 24 && quality > 0 && t > holdUntil) {
        setQuality((quality - 1) as Quality);
        holdUntil = t + 3000;
      }
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const frameMs = t - last;
      const dt = Math.min(0.25, Math.max(0, frameMs / 1000));
      last = t;
      adapt(frameMs, t);
      const st = useGame.getState();
      st.tick(dt);
      const g = useGame.getState().game;
      if (!g || !cam) return;

      // The tower grew (or a bigger save loaded): reframe so the whole tower is in view.
      if (g.building.floors !== floorsSeen) {
        floorsSeen = g.building.floors;
        const f = frame();
        target = { x: f.x, y: f.y };
        if (cam.zoom > f.zoom) zoomTo(f.zoom, view.w / 2, view.h / 2);
      }

      const focus = st.focus;
      if (focus && focus.n !== lastFocus) {
        lastFocus = focus.n;
        const goal = Math.max(cam.zoom, 3);
        zoomTo(goal, view.w / 2, view.h / 2);
        // On phones the panel covers the lower part of the view: aim for the upper area instead.
        const sheetOpen = !!st.panel && view.w < 768;
        const ins = insetsRef.current;
        const visibleTop = ins.top;
        const visibleBottom = sheetOpen ? view.h * 0.34 + ins.top * 0.5 : view.h - ins.bottom;
        const aimY = (visibleTop + visibleBottom) / 2;
        target = { x: focus.x, y: focus.y + (view.h / 2 - aimY) / goal };
      }
      if (zoomGoal) {
        const k = 1 - Math.exp(-dt * 12);
        const next = cam.zoom + (zoomGoal.zoom - cam.zoom) * k;
        const prevZoom = cam.zoom;
        cam = zoomAt(cam, view, worldSize(), next / cam.zoom, zoomGoal.ax, zoomGoal.ay);
        // done, or pinned at the zoom limits
        if (Math.abs(cam.zoom - zoomGoal.zoom) < 0.002 || Math.abs(cam.zoom - prevZoom) < 1e-5) zoomGoal = null;
      }
      if (target) {
        const k = 1 - Math.pow(0.001, dt);
        const before = cam;
        cam = clampCamera({ ...cam, x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k }, view, worldSize());
        const stuck = Math.hypot(cam.x - before.x, cam.y - before.y) < 0.01 && !zoomGoal;
        if (stuck || Math.hypot(target.x - cam.x, target.y - cam.y) < 0.3) target = null;
      }
      if (pointers.size === 0 && (Math.abs(vel.x) > 4 || Math.abs(vel.y) > 4)) {
        cam = panBy(cam, view, worldSize(), vel.x * dt, vel.y * dt);
        const decay = Math.exp(-dt * 4.5);
        vel = { x: vel.x * decay, y: vel.y * decay };
      }
      renderer.render(ctx, g, cam, view, dpr, t, st.selectedWorkerId, quality);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      reframeRef.current = null;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none select-none">
      <canvas ref={canvasRef} className="pixelated block" data-testid="game-canvas" aria-label="NEON HQ building view" />
    </div>
  );
}
