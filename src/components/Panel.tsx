"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { play } from "@/lib/sound";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";

interface Props {
  title: string;
  icon?: IconName;
  accent?: string;
  onClose: () => void;
  children: ReactNode;
  /** sticky action bar at the bottom */
  footer?: ReactNode;
  testId?: string;
}

/**
 * Slide-up sheet on mobile (spring), right-hand drawer on desktop.
 * Header: icon, title, 44 px close. Closes on the X, a tap outside, Escape, or a swipe down on the header.
 */
export default function Panel({ title, icon, accent = T.cyan, onClose, children, footer, testId }: Props) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    play("open");
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
      <button type="button" aria-label="Close panel" className="absolute inset-0 animate-fade bg-black/45" onClick={onClose} />
      <section
        role="dialog"
        aria-label={title}
        className="panel-surface relative flex max-h-[72%] w-full flex-col animate-panel-mobile rounded-t-panel md:max-h-none md:w-[420px] md:animate-panel-desktop md:rounded-none md:rounded-l-panel"
        style={{
          ["--accent" as string]: accent,
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag ? "none" : undefined,
          animation: drag ? "none" : undefined,
        }}
      >
        <header
          className="relative flex shrink-0 touch-none items-center gap-3 px-4 pt-3 pb-2 select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded bg-ink2/30 md:hidden" />
          {icon && (
            <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-button" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
              <Icon name={icon} size={16} />
            </span>
          )}
          <h2 className="mt-1 min-w-0 flex-1 truncate font-arcade text-xs tracking-wider uppercase neon-text" style={{ color: accent }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="pressable mt-1 flex h-11 w-11 items-center justify-center rounded-button border border-line bg-raised text-ink2 hover:text-ink"
            aria-label="Close"
            data-testid="panel-close"
          >
            <Icon name="close" size={12} />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-md text-ink">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]" data-testid="panel-footer">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
