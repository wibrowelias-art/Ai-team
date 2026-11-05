"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SPEEDS } from "@/game/constants";
import { saveGame, saveGameSync } from "@/game/save";
import { useGame } from "@/game/store";
import BottomBar from "./BottomBar";
import GameCanvas from "./GameCanvas";
import Hud from "./Hud";
import { CrewPanel, WorkerPanel } from "./panels/CrewPanels";
import { AwayModal, EventModal, Toasts } from "./Overlays";
import { FactoryPanel, LogPanel, RevenuePanel, RoomPanel, SettingsPanel, TreasuryPanel } from "./panels/OtherPanels";
import { BuildPanel, HirePanel } from "./panels/BuildPanels";
import ChatPanel from "./panels/ChatPanel";
import SoundDirector from "./SoundDirector";
import Tutorial from "./Tutorial";
import { advanceMeeting, MEETING_LINE_INTERVAL_MS, workerTextTick } from "@/game/aiStore";

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
    case "chat":
      return <ChatPanel key={panel.ref} workerId={panel.ref ?? ""} onClose={close} />;
    case "meeting":
      return <RoomPanel id="war_room" onClose={close} />;
    case "hire":
      return <HirePanel onClose={close} />;
  }
}

/** Drives meeting transcripts and workers texting the boss. */
function AiRunner() {
  useEffect(() => {
    const lines = window.setInterval(advanceMeeting, MEETING_LINE_INTERVAL_MS);
    const texts = window.setInterval(() => void workerTextTick(), 2500);
    return () => {
      window.clearInterval(lines);
      window.clearInterval(texts);
    };
  }, []);
  return null;
}

/** Toggle browser fullscreen where it is supported (not on iPhone Safari). */
function FullscreenButton() {
  // GameView only renders in the browser, so document is available here.
  const [supported] = useState(() => typeof document !== "undefined" && !!document.fullscreenEnabled);
  const on = useSyncExternalStore(
    (cb) => {
      document.addEventListener("fullscreenchange", cb);
      return () => document.removeEventListener("fullscreenchange", cb);
    },
    () => !!document.fullscreenElement,
    () => false,
  );
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
      aria-label={on ? "Exit fullscreen" : "Fullscreen"}
      data-testid="fullscreen"
      className="flex h-8 w-9 items-center justify-center rounded border border-white/15 bg-ink/80 text-base text-white/70"
    >
      {on ? "🗗" : "⛶"}
    </button>
  );
}

function TopControls() {
  const speed = useGame((s) => s.game?.settings.speed ?? 1);
  const setSpeed = useGame((s) => s.setSpeed);
  const openPanel = useGame((s) => s.openPanel);
  const sound = useGame((s) => s.game?.settings.sound ?? true);
  const setSetting = useGame((s) => s.setSetting);
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
      <div className="pointer-events-auto flex gap-1.5">
        <FullscreenButton />
        <button
          type="button"
          onClick={() => setSetting("sound", !sound)}
          aria-label={sound ? "Mute sound" : "Unmute sound"}
          aria-pressed={!sound}
          data-testid="mute"
          className="flex h-8 w-9 items-center justify-center rounded border border-white/15 bg-ink/80 text-base text-white/70"
        >
          {sound ? "🔊" : "🔇"}
        </button>
        <button
          type="button"
          onClick={() => openPanel({ id: "settings" })}
          aria-label="Settings"
          data-testid="open-settings"
          className="flex h-8 w-9 items-center justify-center rounded border border-white/15 bg-ink/80 text-lg text-white/70"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

/** Everything on screen while playing. Loaded as its own chunk after the intro. */
/** Size of an element, kept up to date. */
function useHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    setH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

/** Everything on screen while playing. Loaded as its own chunk after the intro. */
export default function GameView() {
  const scanlines = useGame((s) => s.game?.settings.scanlines ?? true);
  useSaveLifecycle(true);
  const hudRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const top = useHeight(hudRef);
  const bottom = useHeight(navRef);
  const insets = useMemo(() => ({ top, bottom }), [top, bottom]);

  // The building fills the whole screen; the HUD and bottom bar float over it.
  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-white" data-testid="game">
      <GameCanvas insets={insets} />
      <div className="vignette pointer-events-none absolute inset-0" />
      {scanlines && <div className="scanlines absolute inset-0" data-testid="scanlines" />}
      <div ref={hudRef} className="absolute inset-x-0 top-0 z-30">
        <Hud />
      </div>
      {/* Overlays live between the HUD and the bottom bar so they never cover either. */}
      <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top, bottom }}>
        <div className="relative h-full w-full">
          <TopControls />
          <Toasts />
          <AiRunner />
          <SoundDirector />
          <Tutorial />
          <Panels />
          <EventModal />
          <AwayModal />
        </div>
      </div>
      <div ref={navRef} className="absolute inset-x-0 bottom-0 z-30">
        <BottomBar />
      </div>
    </main>
  );
}
