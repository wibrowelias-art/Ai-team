"use client";

import { useRef } from "react";
import { findRoom, ROOM_DEFS } from "@/game/building";
import { SPEEDS } from "@/game/constants";
import { deserialize, serialize } from "@/game/save";
import { useGame } from "@/game/store";
import { clockOf, dayOf } from "@/game/time";
import type { GameState, LogEntry, RoomType } from "@/game/types";
import { aiCallsLeft } from "@/lib/aiClient";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { activityLabel, Button, Chip, Empty, Section, Toggle } from "../ui";
import { usePolledGame } from "../usePolled";
import { RoomBuildBox } from "./BuildPanels";
import { CommandContent, FactoryContent, RevenueContent, TreasuryContent } from "./EconomyPanels";
import { MeetingContent } from "./MeetingPanel";

export const ROOM_ICON: Partial<Record<RoomType, IconName>> = {
  COMMAND: "star",
  WAR_ROOM: "meeting",
  REVENUE_BAY: "chart",
  TREASURY: "treasury",
  FACTORY: "factory",
  CHILL: "heart",
  SERVER_ROOM: "bolt",
  RECORDING_STUDIO: "music",
  MARKETING_LAB: "phone",
  VAULT: "lock",
  ROOFTOP_LOUNGE: "sun",
  TRADING_DESK: "chart",
  GYM: "bolt",
  CAFE: "coin",
  NAP_PODS: "bed",
  OFFICE: "crew",
  DATA_CENTER: "flask",
  PODCAST_BOOTH: "sound",
  MERCH_STORE: "shop",
  EMPTY: "plus",
};

export function RoomPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const game = usePolledGame();
  const openPanel = useGame((s) => s.openPanel);
  const meetingLive = useGame((s) => !!s.meeting);
  const room = game ? findRoom(game.building, id) : undefined;
  if (!game || !room) return null;
  const def = ROOM_DEFS[room.type];
  if (room.type === "WAR_ROOM" && meetingLive) {
    return (
      <Panel title="Meeting" icon="meeting" accent={def.color} onClose={onClose} testId="panel-room">
        <MeetingContent game={game} />
      </Panel>
    );
  }
  const here = game.workers.filter((w) => w.target?.roomId === room.id && w.activity !== "walking");
  const heading = game.workers.filter((w) => w.target?.roomId === room.id && w.activity === "walking");
  const accent = room.locked ? T.muted : def.color;

  return (
    <Panel title={def.name} icon={ROOM_ICON[room.type]} accent={accent} onClose={onClose} testId="panel-room">
      <p className="text-sm text-ink2">{def.blurb}</p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-chip bg-raised px-3 py-1.5 font-pixel text-md text-ink2">Floor {game.building.floors - room.floor}</span>
        <span className="rounded-chip bg-raised px-3 py-1.5 font-pixel text-md" style={{ color: accent }}>
          {room.locked ? (room.type === "EMPTY" ? "EMPTY" : "NOT BUILT") : `Level ${room.level}/5`}
        </span>
      </div>
      <div className="mt-3">
        <RoomBuildBox room={room} cash={game.cash} compact={!room.locked || room.type === "EMPTY"} />
      </div>
      {room.locked ? null : (
        <>
          {room.type !== "WAR_ROOM" && (
            <Section title={`In the room · ${here.length}`}>
              {here.length === 0 ? (
                <p className="text-sm text-ink2">Nobody here right now.{heading.length ? ` On the way: ${heading.map((w) => w.name).join(", ")}.` : ""}</p>
              ) : (
                <ul className="stagger flex flex-col gap-1">
                  {here.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className="pressable flex min-h-11 w-full items-center gap-3 rounded-button px-2 text-left hover:bg-raised"
                        onClick={() => openPanel({ id: "worker", ref: w.id })}
                      >
                        <Portrait look={w.look} scale={1.5} />
                        <span className="font-pixel text-md text-ink">{w.name}</span>
                        <span className="truncate text-xs text-ink2">{activityLabel(w, game.building)}</span>
                      </button>
                    </li>
                  ))}
                  {heading.length > 0 && <li className="px-2 text-xs text-ink2">On the way: {heading.map((w) => w.name).join(", ")}</li>}
                </ul>
              )}
            </Section>
          )}
          <RoomFeature type={room.type} game={game} />
        </>
      )}
    </Panel>
  );
}

function RoomFeature({ type, game }: { type: RoomType; game: GameState }) {
  switch (type) {
    case "COMMAND":
      return <CommandContent game={game} />;
    case "WAR_ROOM":
      return <MeetingContent game={game} />;
    case "REVENUE_BAY":
      return (
        <div className="mt-6">
          <RevenueContent game={game} />
        </div>
      );
    case "TREASURY":
      return (
        <div className="mt-6">
          <TreasuryContent game={game} />
        </div>
      );
    case "FACTORY":
      return (
        <div className="mt-6">
          <FactoryContent game={game} />
        </div>
      );
    default:
      return null;
  }
}

export function TreasuryPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  if (!game) return null;
  return (
    <Panel title="Treasury" icon="treasury" accent={T.yellow} onClose={onClose} testId="panel-treasury">
      <TreasuryContent game={game} />
    </Panel>
  );
}

export function RevenuePanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(500);
  if (!game) return null;
  return (
    <Panel title="Revenue Bay" icon="chart" accent={T.green} onClose={onClose} testId="panel-revenue">
      <RevenueContent game={game} />
    </Panel>
  );
}

export function FactoryPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  if (!game) return null;
  return (
    <Panel title="Factory" icon="factory" accent={T.orange} onClose={onClose} testId="panel-factory">
      <FactoryContent game={game} />
    </Panel>
  );
}

const LOG_STYLE: Record<LogEntry["kind"], { color: string; icon: IconName }> = {
  info: { color: T.text2, icon: "clock" },
  good: { color: T.green, icon: "check" },
  bad: { color: T.red, icon: "warn" },
  system: { color: T.cyan, icon: "bolt" },
};

export function LogPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(500);
  if (!game) return null;
  const entries = [...game.log].reverse();
  return (
    <Panel title="Log" icon="log" accent={T.pink} onClose={onClose} testId="panel-log">
      {entries.length === 0 ? (
        <Empty icon="log" text="Nothing has happened yet. Every sale, event and decision ends up here." />
      ) : (
        <ul className="stagger flex flex-col">
          {entries.map((e, i) => {
            const st = LOG_STYLE[e.kind];
            return (
              <li key={`${e.t}-${i}`} className="flex items-start gap-3 border-b border-line/60 py-2 text-sm last:border-0">
                <span className="mt-0.5 shrink-0" style={{ color: st.color }}>
                  <Icon name={st.icon} size={12} />
                </span>
                <span className="min-w-0 flex-1 text-ink">{e.text}</span>
                <span className="shrink-0 font-pixel text-sm text-muted">
                  D{dayOf(e.t)} {clockOf(e.t)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Slider({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-md text-ink">
        <span>{label}</span>
        <span className="font-pixel text-md text-ink2">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="slider" data-testid={testId} aria-label={label} />
    </label>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  // Only the settings object: subscribing to the whole game would re-render every frame.
  const settings = useGame((st) => st.game?.settings);
  const renderQuality = useGame((st) => st.renderQuality);
  const setSetting = useGame((s) => s.setSetting);
  const setSpeed = useGame((s) => s.setSpeed);
  const replaceGame = useGame((s) => s.replaceGame);
  const resetGame = useGame((s) => s.resetGame);
  const toast = useGame((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!settings) return null;
  const s = settings;

  const exportSave = () => {
    const game = useGame.getState().game;
    if (!game) return;
    const blob = new Blob([serialize(game)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neon-hq-save-day${dayOf(game.minutes)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Save exported.");
  };

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    const loaded = deserialize(await file.text());
    if (!loaded) {
      toast("That file is not a NEON HQ save.", "error");
      return;
    }
    replaceGame(loaded);
    toast("Save loaded.");
  };

  return (
    <Panel title="Settings" icon="settings" accent={T.purple} onClose={onClose} testId="panel-settings">
      <Section title="Game speed">
        <div className="grid grid-cols-4 gap-2">
          {SPEEDS.map((sp) => (
            <Chip key={sp} active={s.speed === sp} onClick={() => setSpeed(sp)} testId={`settings-speed-${sp}`}>
              {sp === 0 ? "Pause" : `${sp}x`}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Sound">
        <Toggle label="Sound" value={s.sound} onChange={(v) => setSetting("sound", v)} hint="Chiptune effects and a synth loop" />
        <div className="mt-2 flex flex-col gap-1">
          <Slider label="Music" value={s.music} onChange={(v) => setSetting("music", v)} testId="music-volume" />
          <Slider label="Effects" value={s.sfx} onChange={(v) => setSetting("sfx", v)} testId="sfx-volume" />
        </div>
      </Section>
      <Section title="Graphics">
        <div className="grid grid-cols-3 gap-2">
          {(["auto", "high", "low"] as const).map((gq) => (
            <Chip key={gq} active={s.graphics === gq} onClick={() => setSetting("graphics", gq)} testId={`graphics-${gq}`}>
              {gq[0].toUpperCase() + gq.slice(1)}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink2">
          Rendering at {["low", "medium", "high"][renderQuality]} quality.{s.graphics === "auto" ? " Auto lowers glow and resolution if frames get slow." : ""}
        </p>
        <div className="mt-2">
          <Toggle label="CRT scanlines" value={s.scanlines} onChange={(v) => setSetting("scanlines", v)} testId="toggle-scanlines" />
        </div>
      </Section>
      <Section title="Workers">
        <Toggle
          label="AI replies"
          value={s.ai}
          onChange={(v) => setSetting("ai", v)}
          hint={s.ai ? `${aiCallsLeft()} AI calls left this session, then scripted replies.` : "Workers use scripted replies."}
        />
      </Section>
      <Section title="Save">
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={exportSave} full>
            Export
          </Button>
          <Button onClick={() => fileRef.current?.click()} full>
            Import
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm("Reset the game? Your save will be deleted.")) void resetGame();
            }}
            testId="reset-save"
            full
          >
            Reset
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void importSave(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </Section>
      <Section title="About">
        <p className="text-sm text-ink2">NEON HQ is a game. All money and workers are fictional.</p>
      </Section>
    </Panel>
  );
}
