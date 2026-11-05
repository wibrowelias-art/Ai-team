"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { loadGame } from "@/game/save";
import { useGame } from "@/game/store";
import Intro from "./Intro";

/** Shown to returning players while their save loads. */
function Splash({ force = false }: { force?: boolean }) {
  return (
    <main data-splash className="h-full items-center justify-center bg-bg" style={force ? { display: "flex" } : undefined} aria-busy="true">
      <div className="text-center">
        <h1 className="animate-flicker font-arcade text-2xl leading-relaxed text-pink neon-text">NEON HQ</h1>
        <p className="mt-3 font-pixel text-lg text-ink2">Unlocking the warehouse…</p>
      </div>
    </main>
  );
}

// The in-game UI (canvas, renderer, panels, AI) is a separate chunk so the intro paints fast.
const GameView = dynamic(() => import("./GameView"), { ssr: false, loading: () => <Splash force /> });

export default function Game() {
  const loaded = useGame((s) => s.loaded);
  const started = useGame((s) => !!s.game?.started);
  const setLoaded = useGame((s) => s.setLoaded);

  useEffect(() => {
    let alive = true;
    void loadGame().then((g) => {
      if (!alive) return;
      setLoaded(g);
      // The "has a save" hint was wrong (e.g. storage cleared): show the intro.
      if (!g) delete document.documentElement.dataset.save;
    });
    // Warm up the game chunk while the player reads the intro.
    const idle = window.setTimeout(() => void import("./GameView"), 1200);
    return () => {
      alive = false;
      window.clearTimeout(idle);
    };
  }, [setLoaded]);

  if (started) return <GameView />;
  return (
    <>
      {/* Before the save is read, an inline script picks splash (returning player) or intro (new player). */}
      {!loaded && <Splash />}
      <Intro />
    </>
  );
}
