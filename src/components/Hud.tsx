"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import { clockOf, dayOf, formatDuration, formatMoney, minutesToNextCycle } from "@/game/time";
import { reducedMotion } from "@/ui/motion";
import { T } from "@/ui/tokens";

/** A number that counts smoothly toward its target. */
export function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (reducedMotion() || Math.abs(target - from) < 0.5) {
      const id = requestAnimationFrame(() => {
        shownRef.current = target;
        setShown(target);
      });
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      shownRef.current = from + (target - from) * e;
      setShown(shownRef.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

function Cell({ label, value, color = T.yellow, testId, onClick, flash }: { label: string; value: string; color?: string; testId?: string; onClick?: () => void; flash?: "up" | "down" | null }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`flex min-h-11 min-w-0 flex-col items-center justify-center px-0.5 leading-none ${onClick ? "pressable" : ""}`} data-testid={testId}>
      <span className="truncate font-pixel text-xs tracking-wider text-ink2 uppercase">{label}</span>
      <span className="mt-0.5 truncate font-pixel text-[17px] neon-text transition-colors duration-300" style={{ color: flash === "up" ? T.green : flash === "down" ? T.red : color }}>
        {value}
      </span>
    </Tag>
  );
}

export default function Hud() {
  const cashTarget = useGame((s) => Math.round(s.game?.cash ?? 0));
  const revenueTarget = useGame((s) => Math.round(s.game?.totalRevenue ?? 0));
  const spentTarget = useGame((s) => Math.round(s.game?.totalSpent ?? 0));
  const minute = useGame((s) => Math.floor(s.game?.minutes ?? 0));
  const cycles = useGame((s) => s.game?.cyclesToday ?? 0);
  const openPanel = useGame((s) => s.openPanel);
  const cash = useCountUp(cashTarget);
  const revenue = useCountUp(revenueTarget);
  const spent = useCountUp(spentTarget);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(cashTarget);
  useEffect(() => {
    const d = cashTarget - prev.current;
    prev.current = cashTarget;
    if (Math.abs(d) < 20) return;
    setFlash(d > 0 ? "up" : "down");
    const id = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(id);
  }, [cashTarget]);

  return (
    <header
      className="relative z-30 grid min-h-12 shrink-0 grid-cols-6 border-b border-line bg-bg/70 px-[max(0px,calc((100%-52rem)/2))] py-1 backdrop-blur-[2px]"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 4px)" }}
      data-testid="hud"
    >
      <Cell label="Cash" value={formatMoney(cash, true)} color={cash < 0 ? T.red : T.yellow} testId="hud-cash" onClick={() => openPanel({ id: "treasury" })} flash={flash} />
      <Cell label="Revenue" value={formatMoney(revenue, true)} color={T.green} testId="hud-revenue" onClick={() => openPanel({ id: "revenue" })} />
      <Cell label="Spent" value={formatMoney(spent, true)} color={T.red} testId="hud-spent" onClick={() => openPanel({ id: "treasury" })} />
      <Cell label={`Day ${dayOf(minute)}`} value={clockOf(minute)} color={T.cyan} testId="hud-clock" />
      <Cell label="Next" value={formatDuration(minutesToNextCycle(minute))} color={T.purple} />
      <Cell label="Cycles" value={String(cycles)} color={T.pink} />
    </header>
  );
}
