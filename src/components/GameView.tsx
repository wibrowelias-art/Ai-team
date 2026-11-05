"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SPEEDS } from "@/game/constants";
import { saveGame, saveGameSync } from "@/game/save";
import { useGame } from "@/game/store";
import BottomBar from "./BottomBar";
import GameCanvas from "./GameCanvas";
import Hud from "./Hud";
import dynamic from "next/dynamic";
import { AwayModal, EventModal, MilestoneBanner, ReportModal, Toasts } from "./Overlays";
import SoundDirector from "./SoundDirector";

// Panels load on first open: the canvas and HUD paint without them.
const CrewPanel = dynamic(() => import("./panels/CrewPanels").then((m) => m.CrewPanel), { ssr: false });
const WorkerPanel = dynamic(() => import("./panels/CrewPanels").then((m) => m.WorkerPanel), { ssr: false });
const RoomPanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.RoomPanel), { ssr: false });
const TreasuryPanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.TreasuryPanel), { ssr: false });
const FactoryPanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.FactoryPanel), { ssr: false });
const LogPanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.LogPanel), { ssr: false });
const SettingsPanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.SettingsPanel), { ssr: false });
const RevenuePanel = dynamic(() => import("./panels/OtherPanels").then((m) => m.RevenuePanel), { ssr: false });
const BuildPanel = dynamic(() => import("./panels/BuildPanels").then((m) => m.BuildPanel), { ssr: false });
const HirePanel = dynamic(() => import("./panels/BuildPanels").then((m) => m.HirePanel), { ssr: false });
const ChatPanel = dynamic(() => import("./panels/ChatPanel"), { ssr: false });
import Tutorial from "./Tutorial";
import { advanceMeeting, MEETING_LINE_INTERVAL_MS, workerTextTick } from "@/game/aiStore";
import { play } from "@/lib/sound";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";

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
    // Warm the panel chunks once the first frame is up, so the first tap opens instantly.
    const warm = window.setTimeout(() => {
      void import("./panels/CrewPanels");
      void import("./panels/OtherPanels");
      void import("./panels/BuildPanels");
      void import("./panels/ChatPanel");
    }, 1500);
    const lines = window.setInterval(advanceMeeting, MEETING_LINE_INTERVAL_MS);
    const texts = window.setInterval(() => void workerTextTick(), 2500);
    return () => {
      window.clearTimeout(warm);
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
    <IconButton
      icon="fullscreen"
      label={on ? "Exit fullscreen" : "Fullscreen"}
      pressed={on}
      testId="fullscreen"
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
    />
  );
}

function IconButton({ icon, label, onClick, pressed, testId, color }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; testId?: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        play("click");
        onClick();
      }}
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
      className="pressable flex h-11 w-11 items-center justify-center rounded-button border border-line bg-bg/80 backdrop-blur-[2px]"
      style={{ color: color ?? T.text2, ["--glow" as string]: color ?? T.cyan }}
    >
      <Icon name={icon} size={16} />
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
      <div className="pointer-events-auto flex overflow-hidden rounded-button border border-line bg-bg/80 backdrop-blur-[2px]">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            onClick={() => {
              play("click");
              setSpeed(sp);
            }}
            aria-label={sp === 0 ? "Pause" : `Speed ${sp}x`}
            aria-pressed={speed === sp}
            data-testid={`speed-${sp}`}
            className="pressable flex h-11 min-w-11 items-center justify-center px-2 font-pixel text-lg"
            style={{ color: speed === sp ? T.cyan : T.text2, background: speed === sp ? `color-mix(in srgb, ${T.cyan} 14%, transparent)` : undefined }}
          >
            {sp === 0 ? "❚❚" : `${sp}x`}
          </button>
        ))}
      </div>
      <div className="pointer-events-auto flex gap-2">
        <FullscreenButton />
        <IconButton icon={sound ? "sound" : "mute"} label={sound ? "Mute sound" : "Unmute sound"} pressed={!sound} testId="mute" onClick={() => setSetting("sound", !sound)} />
        <IconButton icon="settings" label="Settings" testId="open-settings" onClick={() => openPanel({ id: "settings" })} />
      </div>
    </div>
  );
}

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
    <main className="relative h-dvh overflow-hidden bg-bg text-ink" data-testid="game">
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
          <MilestoneBanner />
          <ReportModal />
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
