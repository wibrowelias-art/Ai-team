"use client";

import { useEffect, useRef } from "react";
import { buildingBand, hitRoom, worldHeight } from "@/game/building";
import { WORLD_W } from "@/game/constants";
import { useGame } from "@/game/store";
import { clampCamera, initialCamera, panBy, screenToWorld, zoomAt, type Camera, type View } from "@/render/camera";
import { workerAt } from "@/render/hit";
import { Renderer } from "@/render/renderer";

const TAP_SLOP = 8;

function pixelFont(): string {
  if (typeof window === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-vt323").trim();
  return v ? `${v}, monospace` : "monospace";
}

export default function GameCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const worldSize = () => ({ w: WORLD_W, h: worldHeight(useGame.getState().game?.building.floors ?? 3) });

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      canvas.style.width = `${view.w}px`;
      canvas.style.height = `${view.h}px`;
      cam = cam
        ? clampCamera(cam, view, worldSize())
        : initialCamera(view, worldSize(), buildingBand(useGame.getState().game?.building.floors ?? 3));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // ---- input
    const pointers = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number; t: number } | null = null;
    let pinchDist = 0;
    let pinchMid = { x: 0, y: 0 };

    const local = (e: PointerEvent | WheelEvent) => {
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
        if (!tap) cam = panBy(cam, view, worldSize(), p.x - prev.x, p.y - prev.y);
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
      pointers.delete(e.pointerId);
      if (pointers.size === 2) {
        const tp = twoPointer();
        pinchDist = tp.dist;
        pinchMid = tp.mid;
      }
      if (wasTap && cam) handleTap(local(e));
      if (pointers.size === 0) tap = null;
    };

    const handleTap = (p: { x: number; y: number }) => {
      const st = useGame.getState();
      const g = st.game;
      if (!g || !cam) return;
      const w = screenToWorld(cam, view, p.x, p.y);
      const pad = Math.max(3, 14 / cam.zoom);
      const worker = workerAt(g.workers, w.x, w.y, pad);
      if (worker) {
        st.openPanel({ id: "worker", ref: worker.id });
        st.selectWorker(worker.id);
        return;
      }
      const room = hitRoom(g.building, w.x, w.y);
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
      const p = local(e);
      cam = zoomAt(cam, view, worldSize(), Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ---- loop
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, Math.max(0, (t - last) / 1000));
      last = t;
      const st = useGame.getState();
      st.tick(dt);
      const g = useGame.getState().game;
      if (!g || !cam) return;

      const focus = st.focus;
      if (focus && focus.n !== lastFocus) {
        lastFocus = focus.n;
        if (cam.zoom < 3) cam = { ...cam, zoom: 3 };
        // On phones the panel covers the lower part of the view: aim for the upper area instead.
        const sheetOpen = !!st.panel && view.w < 768;
        const offsetY = sheetOpen ? (view.h / 2 - view.h * 0.17) / cam.zoom : 0;
        target = { x: focus.x, y: focus.y + offsetY };
      }
      if (target) {
        const k = 1 - Math.pow(0.001, dt);
        const before = cam;
        cam = clampCamera({ ...cam, x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k }, view, worldSize());
        const stuck = Math.hypot(cam.x - before.x, cam.y - before.y) < 0.01;
        if (stuck || Math.hypot(target.x - cam.x, target.y - cam.y) < 0.5) target = null;
      }
      renderer.render(ctx, g, cam, view, dpr, t, st.selectedWorkerId);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none select-none">
      <canvas ref={canvasRef} className="pixelated block" data-testid="game-canvas" aria-label="NEON HQ building view" />
    </div>
  );
}
