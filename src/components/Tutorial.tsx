"use client";

import { useEffect } from "react";
import { COLORS } from "@/game/constants";
import { TUTORIAL_STEPS, useGame, type PanelId } from "@/game/store";

export interface TutorialStep {
  title: string;
  text: string;
  /** bottom-bar item to highlight */
  highlight?: PanelId;
}

export const STEPS: TutorialStep[] = [
  { title: "Meet the crew", text: "Tap any worker in the building (or open Crew) to see who they are.", highlight: "crew" },
  { title: "Pay a bonus", text: "In their profile, hit a Bonus button. Money makes people happy." },
  { title: "Follow the money", text: "Open the Treasury to see where the cash goes.", highlight: "treasury" },
  { title: "Call a meeting", text: "Open Crew and tap 📣 Meeting. Pick a topic and let them argue.", highlight: "crew" },
  { title: "Build a room", text: "Open Build and build a new room. Studio or Marketing Lab are a good start.", highlight: "build" },
];

/** Watches the game and advances the tutorial when the player does each step. */
function useTutorialWatcher() {
  useEffect(() => {
    return useGame.subscribe((st, prev) => {
      const g = st.game;
      if (!g || g.tutorial.done) return;
      const done = st.tutorialDone;
      switch (g.tutorial.step) {
        case 0:
          if (st.panel?.id === "worker" || st.panel?.id === "chat") done(0);
          break;
        case 1: {
          const paid = g.log !== prev.game?.log && /^Paid .+ bonus/.test(g.log[g.log.length - 1]?.text ?? "");
          if (paid) done(1);
          break;
        }
        case 2:
          if (st.panel?.id === "treasury" || (st.panel?.id === "room" && st.panel.ref === "treasury")) done(2);
          break;
        case 3:
          if (st.meeting && !prev.meeting) done(3);
          break;
        case 4: {
          const built = g.log !== prev.game?.log && /^🏗️ Built/.test(g.log[g.log.length - 1]?.text ?? "");
          if (built) {
            done(4);
            st.toast("Tutorial complete. You're the boss now. 🏆", "info");
          }
          break;
        }
      }
    });
  }, []);
}

export default function Tutorial() {
  useTutorialWatcher();
  const tutorial = useGame((s) => s.game?.tutorial);
  const skip = useGame((s) => s.skipTutorial);
  const away = useGame((s) => !!s.away);
  if (!tutorial || tutorial.done || away) return null;
  const step = STEPS[tutorial.step];
  if (!step) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-[25] flex justify-center px-3 md:justify-start md:pl-4" data-testid="tutorial">
      <div
        className="pointer-events-auto w-full max-w-sm rounded-lg border bg-panel/95 px-3 py-2 shadow-lg animate-fade"
        style={{ borderColor: COLORS.yellow, boxShadow: `0 0 18px -6px ${COLORS.yellow}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-pixel text-[14px] tracking-widest text-hud uppercase">
            Tutorial {tutorial.step + 1}/{TUTORIAL_STEPS} · {step.title}
          </span>
          <button type="button" onClick={skip} className="text-[11px] text-white/50 underline-offset-2 hover:underline" data-testid="tutorial-skip">
            Skip
          </button>
        </div>
        <p className="mt-0.5 text-xs text-white/85" data-testid="tutorial-text">
          {step.text}
        </p>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded" style={{ background: i <= tutorial.step ? COLORS.yellow : "rgba(255,255,255,0.12)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
