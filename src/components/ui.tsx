"use client";

import type { ReactNode } from "react";
import { findRoom, ROOM_DEFS } from "@/game/building";
import type { BuildingState, Worker } from "@/game/types";
import { play } from "@/lib/sound";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";

/** Section header + body. */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-pixel text-sm tracking-[0.2em] text-ink2 uppercase">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger" | "soft";

/**
 * The one button. 44 px tall, presses to 0.96 with a glow, plays a tap sound.
 * `color` sets the neon accent for primary/ghost.
 */
export function Button({
  children,
  onClick,
  color = T.cyan,
  variant = "ghost",
  disabled,
  title,
  testId,
  icon,
  full,
  size = "md",
  type = "button",
  className = "",
}: {
  children?: ReactNode;
  onClick?: () => void;
  color?: string;
  variant?: Variant;
  disabled?: boolean;
  title?: string;
  testId?: string;
  icon?: IconName;
  full?: boolean;
  size?: "sm" | "md";
  type?: "button" | "submit";
  className?: string;
}) {
  const h = size === "sm" ? "h-11" : "h-11";
  const base = `pressable inline-flex items-center justify-center gap-2 rounded-button px-4 font-pixel text-lg tracking-wide uppercase select-none disabled:cursor-not-allowed disabled:opacity-40 ${h} ${full ? "w-full" : ""}`;
  const styles: Record<Variant, React.CSSProperties> = {
    primary: { background: color, color: T.bg, boxShadow: `0 0 18px -6px ${color}` },
    ghost: { border: `1px solid ${color}`, color, background: "transparent" },
    soft: { background: T.raised, border: `1px solid ${T.border}`, color: T.text },
    danger: { border: `1px solid ${T.red}`, color: T.red, background: "transparent" },
  };
  return (
    <button
      type={type}
      onClick={() => {
        play("click");
        onClick?.();
      }}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`${base} ${className}`}
      style={{ ...styles[variant], ["--glow" as string]: variant === "danger" ? T.red : color }}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

/** Small selectable chip (tabs, options). 36 px tall inside a 44 px hit area on touch. */
export function Chip({
  children,
  active,
  onClick,
  color = T.cyan,
  testId,
  disabled,
  role,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  color?: string;
  testId?: string;
  disabled?: boolean;
  role?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : active}
      aria-selected={role === "tab" ? active : undefined}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        play("click");
        onClick?.();
      }}
      className="pressable inline-flex h-11 shrink-0 items-center rounded-chip border px-3 font-pixel text-md whitespace-nowrap disabled:opacity-40"
      style={{
        borderColor: active ? color : T.border,
        color: active ? color : T.text2,
        background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : T.raised,
        ["--glow" as string]: color,
      }}
    >
      {children}
    </button>
  );
}

/** Designed empty state: pixel icon, one helpful line, optional action. */
export function Empty({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-raised/50 px-4 py-6 text-center" data-testid="empty">
      <Icon name={icon} size={28} color={T.muted} />
      <p className="text-sm text-ink2">{text}</p>
      {action}
    </div>
  );
}

/** Big-number tile. */
export function Stat({ label, value, color = T.text, small, testId }: { label: string; value: string; color?: string; small?: string; testId?: string }) {
  return (
    <div className="rounded-button border border-line bg-raised p-3" data-testid={testId}>
      <div className="font-pixel text-sm tracking-widest text-ink2 uppercase">{label}</div>
      <div className="font-pixel text-xl leading-tight" style={{ color }}>
        {value}
      </div>
      {small && <div className="text-xs text-muted">{small}</div>}
    </div>
  );
}

export function StatBar({ label, value, color, testId }: { label: string; value: number; color: string; testId?: string }) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      {label && <span className="w-16 shrink-0 font-pixel text-sm text-ink2 uppercase">{label}</span>}
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-raised">
        <div className="h-full rounded-sm transition-[width] duration-500" style={{ width: `${v}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <span className="w-8 text-right font-pixel text-md text-ink">{v}</span>
    </div>
  );
}

export function Toggle({ label, value, onChange, testId, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; testId?: string; hint?: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-md text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink2">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        data-testid={testId}
        onClick={() => {
          play("click");
          onChange(!value);
        }}
        className="pressable relative h-8 w-14 shrink-0 rounded-full border transition-colors"
        style={{ borderColor: value ? T.cyan : T.border, background: value ? `color-mix(in srgb, ${T.cyan} 25%, transparent)` : T.raised }}
      >
        <span className="absolute top-1 h-5 w-5 rounded-full transition-all" style={{ left: value ? 30 : 4, background: value ? T.cyan : T.muted }} />
      </button>
    </label>
  );
}

/** Row inside a list: raised card with hover. */
export function Row({ children, onClick, testId, className = "" }: { children: ReactNode; onClick?: () => void; testId?: string; className?: string }) {
  const cls = `w-full rounded-button border border-line bg-raised p-3 text-left ${onClick ? "pressable hover:border-ink2/40" : ""} ${className}`;
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={() => {
          play("click");
          onClick();
        }}
        className={cls}
        style={{ ["--glow" as string]: T.cyan }}
      >
        {children}
      </button>
    );
  }
  return (
    <div data-testid={testId} className={cls}>
      {children}
    </div>
  );
}

export function activityLabel(w: Worker, b: BuildingState): string {
  const room = w.target ? findRoom(b, w.target.roomId) : undefined;
  const roomName = room ? ROOM_DEFS[room.type].name : "somewhere";
  switch (w.activity) {
    case "walking":
      return w.route[0]?.kind === "ride" ? `In the elevator → ${roomName}` : `Walking to ${roomName}`;
    case "working":
      return `Working in ${roomName}`;
    case "resting":
      return `Resting in ${roomName}`;
    case "visiting":
      return `Hanging out in ${roomName}`;
    case "meeting":
      return "In a meeting";
    default:
      return "Idle";
  }
}

export function moodLabel(mood: number): { text: string; color: string } {
  if (mood >= 80) return { text: "Great", color: T.green };
  if (mood >= 60) return { text: "Good", color: T.cyan };
  if (mood >= 40) return { text: "Okay", color: T.yellow };
  if (mood >= 20) return { text: "Low", color: T.orange };
  return { text: "Angry", color: T.red };
}
