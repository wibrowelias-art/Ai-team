"use client";

import { useGame, type PanelId } from "@/game/store";
import { play } from "@/lib/sound";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";
import { STEPS } from "./Tutorial";

const ITEMS: { id: PanelId; label: string; icon: IconName; color: string }[] = [
  { id: "crew", label: "Crew", icon: "crew", color: T.cyan },
  { id: "treasury", label: "Treasury", icon: "treasury", color: T.yellow },
  { id: "factory", label: "Factory", icon: "factory", color: T.orange },
  { id: "build", label: "Build", icon: "build", color: T.purple },
  { id: "log", label: "Log", icon: "log", color: T.pink },
];

export default function BottomBar() {
  const panel = useGame((s) => s.panel?.id);
  const openPanel = useGame((s) => s.openPanel);
  const tutorialTarget = useGame((s) => (s.game && !s.game.tutorial.done ? STEPS[s.game.tutorial.step]?.highlight : undefined));
  const approvals = useGame((s) => s.game?.products.filter((p) => p.stage === "approval").length ?? 0);

  return (
    <nav
      className="relative z-30 grid shrink-0 grid-cols-5 border-t border-line bg-bg/75 px-[max(0px,calc((100%-40rem)/2))] backdrop-blur-[2px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      {ITEMS.map((it) => {
        const active = panel === it.id;
        const hint = tutorialTarget === it.id && !active;
        const badge = it.id === "factory" ? approvals : 0;
        return (
          <button
            key={it.id}
            type="button"
            data-testid={`nav-${it.id}`}
            onClick={() => {
              play("click");
              openPanel(active ? null : { id: it.id });
            }}
            className={`pressable relative flex h-14 flex-col items-center justify-center gap-1 ${hint ? "animate-pulse" : ""}`}
            style={{ color: active ? it.color : hint ? T.yellow : T.text2, background: active ? `color-mix(in srgb, ${it.color} 10%, transparent)` : undefined, ["--glow" as string]: it.color }}
            aria-pressed={active}
          >
            <Icon name={it.icon} size={18} />
            <span className={`font-pixel text-sm tracking-wide uppercase ${active ? "neon-text" : ""}`}>{it.label}</span>
            {badge > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-22px)] flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-pixel text-xs text-bg" style={{ background: T.orange }} data-testid="factory-badge">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
