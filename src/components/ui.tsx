"use client";

import type { ReactNode } from "react";
import { findRoom, ROOM_DEFS } from "@/game/building";
import type { BuildingState, Worker } from "@/game/types";

export function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-pixel text-[13px] text-[#8a84b8] uppercase">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-white/10">
        <div className="h-full rounded-sm" style={{ width: `${v}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <span className="w-7 text-right font-pixel text-[13px] text-white/80">{v}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 font-pixel text-[13px] tracking-widest text-[#8a84b8] uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function NeonButton({
  children,
  onClick,
  color = "#22e6ff",
  disabled,
  title,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className="rounded border px-3 py-2 font-pixel text-[15px] tracking-wide uppercase transition-colors enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: color, color, boxShadow: disabled ? undefined : `0 0 10px -4px ${color}` }}
    >
      {children}
    </button>
  );
}

export function Soon({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-white/15 p-3 text-xs text-white/50">{children}</p>;
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
    default:
      return "Idle";
  }
}

export function moodEmoji(mood: number): string {
  if (mood >= 80) return "😄";
  if (mood >= 60) return "🙂";
  if (mood >= 40) return "😐";
  if (mood >= 20) return "😒";
  return "😡";
}
