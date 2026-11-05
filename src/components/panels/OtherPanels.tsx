"use client";

import { useRef } from "react";
import { findRoom, ROOM_DEFS } from "@/game/building";
import { COLORS, SPEEDS } from "@/game/constants";
import { deserialize, serialize } from "@/game/save";
import { useGame } from "@/game/store";
import { clockOf, dayOf } from "@/game/time";
import type { GameState, LogEntry } from "@/game/types";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { activityLabel, NeonButton, Section, Soon } from "../ui";
import { CommandContent, FactoryContent, RevenueContent, TreasuryContent } from "./EconomyPanels";
import { MeetingContent } from "./MeetingPanel";
import { RoomBuildBox } from "./BuildPanels";
import { aiCallsLeft } from "@/lib/aiClient";
import { usePolledGame } from "../usePolled";

export function RoomPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const game = usePolledGame();
  const openPanel = useGame((s) => s.openPanel);
  const meetingLive = useGame((s) => !!s.meeting);
  const room = game ? findRoom(game.building, id) : undefined;
  if (!game || !room) return null;
  const def = ROOM_DEFS[room.type];
  if (room.type === "WAR_ROOM" && meetingLive) {
    return (
      <Panel title="Meeting" accent={def.color} onClose={onClose} testId="panel-room">
        <MeetingContent game={game} />
      </Panel>
    );
  }
  const here = game.workers.filter((w) => w.target?.roomId === room.id && w.activity !== "walking");
  const heading = game.workers.filter((w) => w.target?.roomId === room.id && w.activity === "walking");

  return (
    <Panel title={def.name} accent={room.locked ? "#5a5470" : def.color} onClose={onClose} testId="panel-room">
      <p className="text-xs text-white/70">{def.blurb}</p>
      <div className="mt-3 flex gap-2 font-pixel text-[15px]">
        <span className="rounded bg-black/30 px-2 py-1 text-white/60">Floor {room.floor + 1}</span>
        <span className="rounded bg-black/30 px-2 py-1" style={{ color: def.color }}>
          {room.locked ? "LOCKED" : `Level ${room.level}/5`}
        </span>
      </div>
      <div className="mt-3">
        <RoomBuildBox room={room} cash={game.cash} compact={!room.locked || room.type === "EMPTY"} />
      </div>
      {room.locked ? null : (
        <>
          {/* The War Room is all about the meeting, so its occupant list is skipped. */}
          {room.type !== "WAR_ROOM" && (
            <Section title={`In the room · ${here.length}`}>
              {here.length === 0 ? (
                <p className="text-xs text-white/40">Nobody here right now.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {here.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5"
                        onClick={() => openPanel({ id: "worker", ref: w.id })}
                      >
                        <Portrait look={w.look} scale={1.5} />
                        <span className="font-pixel text-base text-white">{w.name}</span>
                        <span className="truncate text-[11px] text-white/50">{activityLabel(w, game.building)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {heading.length > 0 && (
                <p className="mt-2 text-[11px] text-white/40">On the way: {heading.map((w) => w.name).join(", ")}</p>
              )}
            </Section>
          )}
          <RoomFeature type={room.type} game={game} />
        </>
      )}
    </Panel>
  );
}

const ROOM_FEATURES: Partial<Record<string, string>> = {
  CHILL: "Tired workers come here to recover energy.",
  SERVER_ROOM: "Server upgrades arrive in Phase 4. Pham produces music here.",
};

function RoomFeature({ type, game }: { type: string; game: GameState }) {
  switch (type) {
    case "COMMAND":
      return <CommandContent game={game} />;
    case "WAR_ROOM":
      return <MeetingContent game={game} />;
    case "REVENUE_BAY":
      return (
        <div className="mt-4">
          <RevenueContent game={game} />
        </div>
      );
    case "TREASURY":
      return (
        <div className="mt-4">
          <TreasuryContent game={game} />
        </div>
      );
    case "FACTORY":
      return (
        <div className="mt-4">
          <FactoryContent game={game} />
        </div>
      );
    default:
      return (
        <Section title="Notes">
          <Soon>{ROOM_FEATURES[type] ?? "More features arrive in later phases."}</Soon>
        </Section>
      );
  }
}

export function TreasuryPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  if (!game) return null;
  return (
    <Panel title="Treasury" accent={COLORS.yellow} onClose={onClose} testId="panel-treasury">
      <TreasuryContent game={game} />
    </Panel>
  );
}

export function RevenuePanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(500);
  if (!game) return null;
  return (
    <Panel title="Revenue Bay" accent={COLORS.green} onClose={onClose} testId="panel-revenue">
      <RevenueContent game={game} />
    </Panel>
  );
}

export function FactoryPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  if (!game) return null;
  return (
    <Panel title="Factory" accent={COLORS.orange} onClose={onClose} testId="panel-factory">
      <FactoryContent game={game} />
    </Panel>
  );
}


const LOG_COLORS: Record<LogEntry["kind"], string> = {
  info: "text-white/75",
  good: "text-neon-green",
  bad: "text-danger",
  system: "text-cyan",
};

export function LogPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(500);
  if (!game) return null;
  return (
    <Panel title="Log" accent={COLORS.pink} onClose={onClose} testId="panel-log">
      <ul className="flex flex-col gap-1">
        {[...game.log].reverse().map((e, i) => (
          <li key={`${e.t}-${i}`} className="flex gap-2 text-xs">
            <span className="shrink-0 font-pixel text-[14px] text-[#8a84b8]">
              D{dayOf(e.t)} {clockOf(e.t)}
            </span>
            <span className={LOG_COLORS[e.kind]}>{e.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Toggle({ label, value, onChange, testId }: { label: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-center justify-between py-1.5">
      <span className="font-pixel text-lg text-white/85">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        data-testid={testId}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full border transition-colors ${value ? "border-cyan bg-cyan/30" : "border-white/20 bg-white/5"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${value ? "left-6 bg-cyan" : "left-0.5 bg-white/50"}`} />
      </button>
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
  };

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    const loaded = deserialize(await file.text());
    if (!loaded) {
      window.alert("That file is not a valid NEON HQ save.");
      return;
    }
    replaceGame(loaded);
  };

  return (
    <Panel title="Settings" accent={COLORS.purple} onClose={onClose} testId="panel-settings">
      <Section title="Game speed">
        <div className="grid grid-cols-4 gap-2">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={`rounded border py-1.5 font-pixel text-lg ${s.speed === sp ? "border-cyan text-cyan neon-border" : "border-white/15 text-white/60"}`}
            >
              {sp === 0 ? "❚❚" : `${sp}x`}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Graphics">
        <div className="grid grid-cols-3 gap-2">
          {(["auto", "high", "low"] as const).map((gq) => (
            <button
              key={gq}
              type="button"
              onClick={() => setSetting("graphics", gq)}
              className={`rounded border py-1.5 font-pixel text-lg capitalize ${s.graphics === gq ? "border-cyan text-cyan neon-border" : "border-white/15 text-white/60"}`}
              data-testid={`graphics-${gq}`}
            >
              {gq}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-white/40">
          Now rendering at {["low", "medium", "high"][renderQuality]} quality.{s.graphics === "auto" ? " Auto lowers glow and resolution if frames get slow." : ""}
        </p>
      </Section>
      <Section title="Options">
        <Toggle label="Sound" value={s.sound} onChange={(v) => setSetting("sound", v)} />
        <Toggle label="CRT scanlines" value={s.scanlines} onChange={(v) => setSetting("scanlines", v)} testId="toggle-scanlines" />
        <Toggle label="AI replies" value={s.ai} onChange={(v) => setSetting("ai", v)} />
        <p className="text-[11px] text-white/40">
          {s.ai ? `${aiCallsLeft()} AI calls left this session. Scripted replies take over after that.` : "Workers use scripted replies."}
        </p>
      </Section>
      <Section title="Save">
        <div className="flex flex-wrap gap-2">
          <NeonButton onClick={exportSave}>Export</NeonButton>
          <NeonButton onClick={() => fileRef.current?.click()}>Import</NeonButton>
          <NeonButton
            color={COLORS.red}
            onClick={() => {
              if (window.confirm("Reset the game? Your save will be deleted.")) void resetGame();
            }}
            testId="reset-save"
          >
            Reset
          </NeonButton>
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
        <p className="text-xs text-white/60">NEON HQ is a game. All money and workers are fictional.</p>
      </Section>
    </Panel>
  );
}

