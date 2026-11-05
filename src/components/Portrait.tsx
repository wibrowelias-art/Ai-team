"use client";

import { useEffect, useRef } from "react";
import type { WorkerLook } from "@/game/types";
import { composeFrame, FRAME_H, FRAME_W, paintGrid, paletteFor } from "@/render/sprites";

/** Pixel portrait of a worker (idle frame), scaled up crisply with CSS. */
export default function Portrait({ look, scale = 3, className = "" }: { look: WorkerLook; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(look);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const parsed = JSON.parse(key) as WorkerLook;
    ctx.clearRect(0, 0, c.width, c.height);
    paintGrid(ctx, composeFrame(parsed, "idle0"), paletteFor(parsed), 0, 0);
  }, [key]);

  return (
    <canvas
      ref={ref}
      width={FRAME_W}
      height={FRAME_H}
      className={`pixelated ${className}`}
      style={{ width: FRAME_W * scale, height: FRAME_H * scale }}
      aria-hidden
    />
  );
}
