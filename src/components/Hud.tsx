"use client";

import { useGame } from "@/game/store";
import { clockOf, dayOf, formatDuration, formatMoney, minutesToNextCycle } from "@/game/time";

function Cell({
  label,
  value,
  color = "text-hud",
  testId,
  onClick,
}: {
  label: string;
  value: string;
  color?: string;
  testId?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex min-w-0 flex-col items-center justify-center px-0.5 leading-none"
      data-testid={testId}
    >
      <span className="truncate font-pixel text-[11px] tracking-wider text-[#8a84b8] uppercase">{label}</span>
      <span className={`mt-0.5 truncate font-pixel text-[17px] neon-text ${color}`}>{value}</span>
    </Tag>
  );
}

export default function Hud() {
  const cash = useGame((s) => s.game?.cash ?? 0);
  const revenue = useGame((s) => s.game?.totalRevenue ?? 0);
  const spent = useGame((s) => s.game?.totalSpent ?? 0);
  const minute = useGame((s) => Math.floor(s.game?.minutes ?? 0));
  const cycles = useGame((s) => s.game?.cyclesToday ?? 0);
  const openPanel = useGame((s) => s.openPanel);

  return (
    <header
      className="relative z-30 grid min-h-11 shrink-0 grid-cols-6 px-[max(0px,calc((100%-52rem)/2))] py-1 border-b border-pink/30 bg-ink/70 backdrop-blur-[2px] shadow-[0_2px_16px_-4px_rgba(255,43,214,0.45)]"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 4px)" }}
      data-testid="hud"
    >
      <Cell label="Cash" value={formatMoney(cash, true)} color={cash < 0 ? "text-danger" : "text-hud"} testId="hud-cash" onClick={() => openPanel({ id: "treasury" })} />
      <Cell label="Revenue" value={formatMoney(revenue, true)} color="text-neon-green" testId="hud-revenue" onClick={() => openPanel({ id: "revenue" })} />
      <Cell label="Spent" value={formatMoney(spent, true)} color="text-danger" testId="hud-spent" onClick={() => openPanel({ id: "treasury" })} />
      <Cell label={`Day ${dayOf(minute)}`} value={clockOf(minute)} color="text-cyan" testId="hud-clock" />
      <Cell label="Next" value={formatDuration(minutesToNextCycle(minute))} color="text-purple" />
      <Cell label="Cycles" value={String(cycles)} color="text-pink" />
    </header>
  );
}
