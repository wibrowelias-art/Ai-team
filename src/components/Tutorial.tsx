"use client";

import { useEffect } from "react";
import { TUTORIAL_STEPS, useGame, type PanelId } from "@/game/store";
import { Icon } from "@/ui/icons";
import { T } from "@/ui/tokens";

export interface TutorialStep {
  title: string;
  text: string;
  /** bottom-bar item to highlight */
  highlight?: PanelId;
  /** data-testid of the control to point at, if it is on screen */
  target?: string;
}

export const STEPS: TutorialStep[] = [
  { title: "Meet the crew", text: "Tap any worker in the building, or open Crew.", highlight: "crew", target: "nav-crew" },
  { title: "Pay a bonus", text: "In their profile, tap a Bonus. Money makes people happy.", target: "bonus-100" },
  { title: "Follow the money", text: "Open the Treasury to see where the cash goes.", highlight: "treasury", target: "nav-treasury" },
  { title: "Call a meeting", text: "Open Crew and tap Meeting. Pick a topic and let them argue.", highlight: "crew", target: "open-meeting" },
  { title: "Build a room", text: "Open Build and put something in an empty slot. A Café is a good start.", highlight: "build", target: "nav-build" },
];

/** Watches the game and advances the tutorial when the player does each step. */
function useTutorialWatcher() {
  useEffect(() => {
    return useGame.subscribe((st, prev) => {
      const g = st.game;
      if (!g || g.tutorial.done) return;
      const done = st.tutorialDone;
      // Log lines added by this state change (entries are reused by reference between states).
      const fresh = g.log === prev.game?.log ? [] : g.log.filter((l) => !prev.game?.log.includes(l));
      const logged = (re: RegExp) => fresh.some((l) => re.test(l.text));
      switch (g.tutorial.step) {
        case 0:
          if (st.panel?.id === "worker" || st.panel?.id === "chat") done(0);
          break;
        case 1: {
          if (logged(/^Paid .+ bonus/)) done(1);
          break;
        }
        case 2:
          if (st.panel?.id === "treasury" || (st.panel?.id === "room" && st.panel.ref === "treasury")) done(2);
          break;
        case 3:
          if (st.meeting && !prev.meeting) done(3);
          break;
        case 4: {
          if (logged(/^🏗️ Built/)) {
            done(4);
            st.toast("Tutorial complete. You're the boss now.", "info");
          }
          break;
        }
      }
    });
  }, []);
}

/** Pulsing ring + arrow on the control the current step points at. */
function Pointer({ target }: { target: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${target}"]`);
    if (!el) return;
    const ring = document.createElement("div");
    ring.setAttribute("data-tutorial-ring", "");
    ring.style.cssText = `position:fixed;pointer-events:none;z-index:60;border:2px solid ${T.yellow};border-radius:12px;box-shadow:0 0 16px -2px ${T.yellow};transition:all 150ms`;
    const arrow = document.createElement("div");
    arrow.style.cssText = `position:absolute;left:50%;top:-22px;transform:translateX(-50%);color:${T.yellow};font-size:18px;line-height:1;animation:rise-in 700ms ease-in-out infinite alternate`;
    arrow.textContent = "▼";
    ring.appendChild(arrow);
    document.body.appendChild(ring);
    let raf = 0;
    const place = () => {
      const r = el.getBoundingClientRect();
      ring.style.left = `${r.left - 4}px`;
      ring.style.top = `${r.top - 4}px`;
      ring.style.width = `${r.width + 8}px`;
      ring.style.height = `${r.height + 8}px`;
      raf = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(raf);
      ring.remove();
    };
  }, [target]);
  return null;
}

export default function Tutorial() {
  useTutorialWatcher();
  const tutorial = useGame((s) => s.game?.tutorial);
  const skip = useGame((s) => s.skipTutorial);
  const away = useGame((s) => !!s.away);
  const panel = useGame((s) => s.panel?.id);
  if (!tutorial || tutorial.done || away) return null;
  const step = STEPS[tutorial.step];
  if (!step) return null;
  // Point at the control only while it is on screen.
  const targetVisible = step.target && (step.target.startsWith("nav-") ? !panel : step.target === "bonus-100" ? panel === "worker" : step.target === "open-meeting" ? panel === "crew" : true);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-[25] flex justify-center px-3 md:justify-start md:pl-4" data-testid="tutorial">
      {targetVisible && step.target && <Pointer target={step.target} />}
      <div className="panel-surface pointer-events-auto w-full max-w-sm animate-pop rounded-panel px-4 py-3" style={{ ["--accent" as string]: T.yellow }}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-pixel text-sm tracking-[0.2em] text-yellow uppercase">
            <Icon name="star" size={12} />
            {tutorial.step + 1}/{TUTORIAL_STEPS} · {step.title}
          </span>
          <button type="button" onClick={skip} className="pressable -mr-2 flex h-11 items-center px-3 text-sm text-ink2 hover:text-ink" data-testid="tutorial-skip">
            Skip
          </button>
        </div>
        <p className="text-sm text-ink" data-testid="tutorial-text">
          {step.text}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded" style={{ background: i <= tutorial.step ? T.yellow : T.border }} />
          ))}
        </div>
      </div>
    </div>
  );
}
