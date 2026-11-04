"use client";

import { useCallback, useEffect } from "react";
import { SPEEDS } from "@/game/constants";
import { loadGame, saveGame, saveGameSync } from "@/game/save";
import { useGame } from "@/game/store";
import BottomBar from "./BottomBar";
import GameCanvas from "./GameCanvas";
import Hud from "./Hud";
import Intro from "./Intro";
import { CrewPanel, WorkerPanel } from "./panels/CrewPanels";
import { AwayModal, EventModal, Toasts } from "./Overlays";
import { BuildPanel, FactoryPanel, LogPanel, RevenuePanel, RoomPanel, SettingsPanel, TreasuryPanel } from "./panels/OtherPanels";

const AUTOSAVE_MS = 10_000;

function useSaveLifecycle(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const save = () => {
      const g = useGame.getState().game;
      if (g) void saveGame(g);
    };
    const saveNow = () => {
      const g = useGame.getState().game;
      if (g) saveGameSync(g);
    };
    const id = window.setInterval(save, AUTOSAVE_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        saveNow();
        save();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [active]);
}

function Panels() {
  const panel = useGame((s) => s.panel);
  const openPanel = useGame((s) => s.openPanel);
  const selectWorker = useGame((s) => s.selectWorker);
  const close = useCallback(() => {
    openPanel(null);
    selectWorker(null);
  }, [openPanel, selectWorker]);
  if (!panel) return null;
  switch (panel.id) {
    case "crew":
      return <CrewPanel onClose={close} />;
    case "worker":
      return <WorkerPanel key={panel.ref} id={panel.ref ?? ""} onClose={close} />;
    case "room":
      return <RoomPanel key={panel.ref} id={panel.ref ?? ""} onClose={close} />;
    case "treasury":
      return <TreasuryPanel onClose={close} />;
    case "factory":
      return <FactoryPanel onClose={close} />;
    case "build":
      return <BuildPanel onClose={close} />;
    case "log":
      return <LogPanel onClose={close} />;
    case "settings":
      return <SettingsPanel onClose={close} />;
    case "revenue":
      return <RevenuePanel onClose={close} />;
  }
}

function TopControls() {
  const speed = useGame((s) => s.game?.settings.speed ?? 1);
  const setSpeed = useGame((s) => s.setSpeed);
  const openPanel = useGame((s) => s.openPanel);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between p-2">
      <div className="pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-ink/80">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            onClick={() => setSpeed(sp)}
            aria-label={sp === 0 ? "Pause" : `Speed ${sp}x`}
            aria-pressed={speed === sp}
            data-testid={`speed-${sp}`}
            className={`h-8 min-w-9 px-2 font-pixel text-base ${speed === sp ? "bg-cyan/20 text-cyan" : "text-white/55"}`}
          >
            {sp === 0 ? "❚❚" : `${sp}x`}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => openPanel({ id: "settings" })}
        aria-label="Settings"
        data-testid="open-settings"
        className="pointer-events-auto flex h-8 w-9 items-center justify-center rounded border border-white/15 bg-ink/80 text-lg text-white/70"
      >
        ⚙
      </button>
    </div>
  );
}

export default function Game() {
  const loaded = useGame((s) => s.loaded);
  const started = useGame((s) => !!s.game?.started);
  const scanlines = useGame((s) => s.game?.settings.scanlines ?? true);
  const setLoaded = useGame((s) => s.setLoaded);

  useEffect(() => {
    let alive = true;
    void loadGame().then((g) => alive && setLoaded(g));
    return () => {
      alive = false;
    };
  }, [setLoaded]);

  useSaveLifecycle(started);

  if (!loaded) {
    return (
      <main className="flex h-full items-center justify-center bg-ink">
        <span className="animate-flicker font-arcade text-sm text-pink neon-text">LOADING…</span>
      </main>
    );
  }
  if (!started) return <Intro />;

  return (
    <main className="flex h-dvh flex-col bg-ink text-white" data-testid="game">
      <Hud />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <GameCanvas />
        <div className="vignette absolute inset-0" />
        {scanlines && <div className="scanlines absolute inset-0" data-testid="scanlines" />}
        <TopControls />
        <Toasts />
        <Panels />
        <EventModal />
        <AwayModal />
      </div>
      <BottomBar />
    </main>
  );
}
