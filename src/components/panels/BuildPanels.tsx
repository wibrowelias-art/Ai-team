"use client";

import { useEffect, useState } from "react";
import { buildOptions } from "@/game/build";
import { ROOM_DEFS } from "@/game/building";
import { FOCUS_LABEL } from "@/game/business";
import { COLORS } from "@/game/constants";
import { REROLL_COST } from "@/game/hiring";
import { useGame } from "@/game/store";
import { formatMoney } from "@/game/time";
import type { GameState, RoomSlot } from "@/game/types";
import {
  addFloorCost,
  BUILD_COST,
  MAX_FLOORS,
  MAX_ROOM_LEVEL,
  MAX_UPGRADE_LEVEL,
  maxCrew,
  ROOM_EFFECT,
  roomUpgradeCost,
  SHOP_UPGRADES,
  UNIQUE_ROOMS,
  UPGRADE_IDS,
  upgradeCost,
} from "@/game/upgrades";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { NeonButton, Section } from "../ui";
import { usePolledGame } from "../usePolled";

function Pips({ level, max, color }: { level: number; max: number; color: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-sm" style={{ background: i < level ? color : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

/** Build / upgrade box for one room (used in the room panel and the Build panel). */
export function RoomBuildBox({ room, cash, compact = false }: { room: RoomSlot; cash: number; compact?: boolean }) {
  const buildRoom = useGame((s) => s.buildRoom);
  const upgradeRoom = useGame((s) => s.upgradeRoom);
  const def = ROOM_DEFS[room.type];
  const effect = ROOM_EFFECT[room.type];

  if (room.locked && room.type === "EMPTY") return <EmptySlotBox room={room} cash={cash} compact={compact} />;
  if (room.locked) {
    const cost = BUILD_COST[room.type];
    return (
      <div className="rounded border border-white/10 bg-black/20 p-2" data-testid={`build-${room.id}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-pixel text-base text-white">{def.name}</div>
            {effect && <div className="text-[11px] text-white/55">{effect}</div>}
          </div>
          {cost !== undefined && (
            <NeonButton color={COLORS.purple} disabled={cash < cost} onClick={() => buildRoom(room.id)} testId={`build-btn-${room.id}`}>
              Build {formatMoney(cost)}
            </NeonButton>
          )}
        </div>
      </div>
    );
  }
  const maxed = room.level >= MAX_ROOM_LEVEL;
  const cost = roomUpgradeCost(room.level);
  return (
    <div className={compact ? "" : "rounded border border-white/10 bg-black/20 p-2"} data-testid={`upgrade-${room.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {!compact && <span className="font-pixel text-base text-white">{def.name}</span>}
            <Pips level={room.level} max={MAX_ROOM_LEVEL} color={def.color} />
          </div>
          {effect && <div className="text-[11px] text-white/55">{effect}</div>}
        </div>
        {maxed ? (
          <span className="font-pixel text-sm text-white/40">MAX</span>
        ) : (
          <NeonButton color={def.color} disabled={cash < cost} onClick={() => upgradeRoom(room.id)} testId={`upgrade-btn-${room.id}`}>
            Lv{room.level + 1} {formatMoney(cost)}
          </NeonButton>
        )}
      </div>
    </div>
  );
}

/** An empty slot: pick a room type from the catalog. */
function EmptySlotBox({ room, cash, compact }: { room: RoomSlot; cash: number; compact: boolean }) {
  const game = useGame((s) => s.game);
  const buildRoom = useGame((s) => s.buildRoom);
  const [open, setOpen] = useState(compact);
  const options = game ? buildOptions(game, room.id) : [];
  return (
    <div className="rounded border border-dashed border-white/20 bg-black/20 p-2" data-testid={`build-${room.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-pixel text-base text-white">Empty slot · floor {(game?.building.floors ?? 0) - room.floor}</div>
          <div className="text-[11px] text-white/55">Pick what to build here.</div>
        </div>
        {!compact && (
          <NeonButton color={COLORS.purple} onClick={() => setOpen(!open)} testId={`choose-${room.id}`}>
            {open ? "Hide" : "Choose"}
          </NeonButton>
        )}
      </div>
      {open && (
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {options.map((t) => {
            const def = ROOM_DEFS[t];
            const cost = BUILD_COST[t] ?? 0;
            return (
              <li key={t} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/30 p-1.5">
                <div className="min-w-0">
                  <div className="font-pixel text-[15px]" style={{ color: def.color }}>
                    {def.name}
                    {UNIQUE_ROOMS.includes(t) ? <span className="ml-1 text-[11px] text-white/40">unique</span> : null}
                  </div>
                  <div className="text-[10px] leading-tight text-white/55">{ROOM_EFFECT[t]}</div>
                </div>
                <NeonButton color={def.color} disabled={cash < cost} onClick={() => buildRoom(room.id, t)} testId={`build-${room.id}-${t}`}>
                  {formatMoney(cost)}
                </NeonButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BuildContent({ game }: { game: GameState }) {
  const addFloor = useGame((s) => s.addFloor);
  const buyUpgrade = useGame((s) => s.buyUpgrade);
  const locked = game.building.rooms.filter((r) => r.locked);
  const built = game.building.rooms.filter((r) => !r.locked);
  const canAddFloor = game.building.floors < MAX_FLOORS;

  return (
    <div data-testid="build-content">
      <p className="font-pixel text-[15px] text-white/60">
        Cash <span className="text-hud">{formatMoney(game.cash)}</span>
      </p>

      <Section title={`New rooms · ${locked.length}`}>
        {locked.length === 0 ? (
          <p className="text-xs text-white/40">Every room is built.{canAddFloor ? " Add a floor for more." : ""}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {locked.map((r) => (
              <RoomBuildBox key={r.id} room={r} cash={game.cash} />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Floors · ${game.building.floors}/${MAX_FLOORS}`}>
        {canAddFloor ? (
          <div className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/20 p-2">
            <div className="text-[11px] text-white/55">
              A new top floor with 4 empty slots to build anything from the catalog. Rent goes up $150/day.
            </div>
            <NeonButton color={COLORS.cyan} disabled={game.cash < addFloorCost(game.building.floors)} onClick={addFloor} testId="add-floor">
              Add {formatMoney(addFloorCost(game.building.floors))}
            </NeonButton>
          </div>
        ) : (
          <p className="text-xs text-white/40">The building is at its maximum height.</p>
        )}
      </Section>

      <Section title="Shop upgrades">
        <div className="flex flex-col gap-2">
          {UPGRADE_IDS.map((id) => {
            const def = SHOP_UPGRADES[id];
            const lvl = game.upgrades[id] ?? 0;
            const cost = upgradeCost(id, lvl);
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/20 p-2" data-testid={`shop-${id}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-base text-white">
                      {def.icon} {def.name}
                    </span>
                    <Pips level={lvl} max={MAX_UPGRADE_LEVEL} color={COLORS.yellow} />
                  </div>
                  <div className="text-[11px] text-white/55">{def.blurb}</div>
                </div>
                {cost === null ? (
                  <span className="font-pixel text-sm text-white/40">MAX</span>
                ) : (
                  <NeonButton color={COLORS.yellow} disabled={game.cash < cost} onClick={() => buyUpgrade(id)} testId={`buy-${id}`}>
                    {formatMoney(cost)}
                  </NeonButton>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Room levels">
        <div className="flex flex-col gap-2">
          {built.map((r) => (
            <RoomBuildBox key={r.id} room={r} cash={game.cash} />
          ))}
        </div>
      </Section>
    </div>
  );
}

export function BuildPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  if (!game) return null;
  return (
    <Panel title="Build" accent={COLORS.purple} onClose={onClose} testId="panel-build">
      <BuildContent game={game} />
    </Panel>
  );
}

export function HirePanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame(300);
  const refresh = useGame((s) => s.refreshCandidates);
  const reroll = useGame((s) => s.rerollCandidates);
  const hire = useGame((s) => s.hire);
  const skip = useGame((s) => s.skipCandidate);
  useEffect(() => refresh(), [refresh]);
  if (!game) return null;
  const cap = maxCrew(game);
  const full = game.workers.length >= cap;

  return (
    <Panel title="Hire" accent={COLORS.green} onClose={onClose} testId="panel-hire">
      <p className="text-xs text-white/60">
        Crew {game.workers.length}/{cap}. Hiring costs one day&apos;s salary as a signing bonus. New shortlist every day.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {game.candidates.map((c) => (
          <li key={c.id} className="rounded border border-white/10 bg-black/20 p-2" data-testid="candidate">
            <div className="flex gap-3">
              <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded bg-ink2">
                <Portrait look={c.look} scale={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-pixel text-lg leading-none text-white">{c.name}</span>
                  <span className="font-pixel text-[15px] text-hud">{formatMoney(c.salary)}/day</span>
                </div>
                <div className="text-[11px] text-cyan/80">
                  {c.role} · {FOCUS_LABEL[c.focus]} · skill {c.skill}
                </div>
                <div className="text-[11px] text-white/60 italic">{c.personality}</div>
                <div className="text-[11px] text-white/50">{c.bio}</div>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => skip(c.id)} className="rounded border border-white/15 px-3 py-1 font-pixel text-[15px] text-white/60">
                Skip
              </button>
              <NeonButton color={COLORS.green} disabled={full || game.cash < c.salary} onClick={() => hire(c.id)} testId="hire-btn">
                Hire
              </NeonButton>
            </div>
          </li>
        ))}
        {game.candidates.length === 0 && <li className="text-xs text-white/40">No candidates left today.</li>}
      </ul>
      <div className="mt-3">
        <NeonButton color={COLORS.cyan} disabled={game.cash < REROLL_COST} onClick={reroll} testId="reroll">
          New shortlist ({formatMoney(REROLL_COST)})
        </NeonButton>
      </div>
    </Panel>
  );
}
