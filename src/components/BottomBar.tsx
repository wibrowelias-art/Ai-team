"use client";

import { useGame, type PanelId } from "@/game/store";
import { STEPS } from "./Tutorial";

const ITEMS: { id: PanelId; label: string; icon: string; color: string }[] = [
  { id: "crew", label: "Crew", icon: "👥", color: "text-cyan" },
  { id: "treasury", label: "Treasury", icon: "💰", color: "text-hud" },
  { id: "factory", label: "Factory", icon: "🏭", color: "text-[#ff9a3c]" },
  { id: "build", label: "Build", icon: "🛠️", color: "text-purple" },
  { id: "log", label: "Log", icon: "📜", color: "text-pink" },
];

export default function BottomBar() {
  const panel = useGame((s) => s.panel?.id);
  const openPanel = useGame((s) => s.openPanel);
  const tutorialTarget = useGame((s) => (s.game && !s.game.tutorial.done ? STEPS[s.game.tutorial.step]?.highlight : undefined));

  return (
    <nav
      className="relative z-30 grid shrink-0 grid-cols-5 px-[max(0px,calc((100%-40rem)/2))] border-t border-cyan/25 bg-ink/75 backdrop-blur-[2px] shadow-[0_-2px_16px_-4px_rgba(34,230,255,0.35)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      {ITEMS.map((it) => {
        const active = panel === it.id;
        return (
          <button
            key={it.id}
            type="button"
            data-testid={`nav-${it.id}`}
            onClick={() => openPanel(active ? null : { id: it.id })}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? `${it.color} bg-white/5` : "text-[#8a84b8] hover:text-white"
            } ${tutorialTarget === it.id && !active ? "animate-pulse text-hud" : ""}`}
            aria-pressed={active}
          >
            <span className="text-lg leading-none" aria-hidden>
              {it.icon}
            </span>
            <span className={`font-pixel text-[13px] tracking-wide uppercase ${active ? "neon-text" : ""}`}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
