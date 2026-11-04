"use client";

import { useEffect, useRef } from "react";
import type { ProductType } from "@/game/types";
import { MOCKUP_SIZE, mockupPixels } from "@/render/mockups";

export default function ProductMockup({ type, seed, size = 40 }: { type: ProductType; seed: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, MOCKUP_SIZE, MOCKUP_SIZE);
    mockupPixels(type, seed).forEach((row, y) =>
      row.forEach((c, x) => {
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
  }, [type, seed]);
  return (
    <canvas
      ref={ref}
      width={MOCKUP_SIZE}
      height={MOCKUP_SIZE}
      className="pixelated shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
