"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  title: string;
  accent?: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

/**
 * Slide-up sheet on mobile, right-hand drawer on desktop.
 * Closes on the X, a tap outside, Escape, or a swipe down on the handle/header.
 */
export default function Panel({ title, accent = "#22e6ff", onClose, children, testId }: Props) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDrag(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (drag > 80) onClose();
    start.current = null;
    setDrag(0);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-end md:items-stretch md:justify-end" data-testid={testId}>
      <button type="button" aria-label="Close panel" className="absolute inset-0 animate-fade bg-black/40" onClick={onClose} />
      <section
        role="dialog"
        aria-label={title}
        className="relative flex max-h-[66%] w-full flex-col animate-panel-mobile rounded-t-xl border-t-2 bg-panel/95 md:max-h-none md:w-[400px] md:animate-panel-desktop md:rounded-none md:border-t-0 md:border-l-2"
        style={{
          borderColor: accent,
          boxShadow: `0 0 24px -6px ${accent}`,
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag ? "none" : "transform 150ms ease-out",
        }}
      >
        <header
          className="flex shrink-0 touch-none items-center justify-between gap-2 px-4 pt-2 pb-2 select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded bg-white/20 md:hidden" />
          <h2 className="mt-2 font-arcade text-[11px] tracking-wider uppercase neon-text" style={{ color: accent }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-1 flex h-9 w-9 items-center justify-center rounded border border-white/15 font-pixel text-xl text-white/80 hover:border-white/40 hover:text-white"
            aria-label="Close"
            data-testid="panel-close"
          >
            ×
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-sm">{children}</div>
      </section>
    </div>
  );
}
