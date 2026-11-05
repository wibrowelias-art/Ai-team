"use client";

import { useEffect, useState } from "react";
import { buildOptions } from "@/game/build";
import { ROOM_DEFS } from "@/game/building";
import { FOCUS_LABEL } from "@/game/business";
import { REROLL_COST } from "@/game/hiring";
import { useGame } from "@/game/store";
import { formatMoney } from "@/game/time";
import type { GameState, RoomSlot } from "@/game/types";
import { addFloorCost, BUILD_COST, MAX_FLOORS, MAX_ROOM_LEVEL, MAX_UPGRADE_LEVEL, maxCrew, ROOM_EFFECT, roomUpgradeCost, SHOP_UPGRADES, UNIQUE_ROOMS, UPGRADE_IDS, upgradeCost } from "@/game/upgrades";
import { Icon } from "@/ui/icons";
import { T } from "@/ui/tokens";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { Button, Empty, Section } from "../ui";
import { usePolledGame } from "../usePolled";

function Pips({ level, max, color }: { level: number; max: number; color: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-sm" style={{ background: i < level ? color : T.border }} />
      ))}
    </span>
  );
}

const costTitle = (cash: number, cost: number) => (cash < cost ? `Not enough cash (need ${formatMoney(cost)})` : undefined);

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
      <div className="rounded-button border border-line bg-raised p-3" data-testid={`build-${room.id}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-pixel text-lg text-ink">{def.name}</div>
            {effect && <div className="text-xs text-ink2">{effect}</div>}
          </div>
          {cost !== undefined && (
            <Button color={T.purple} variant="primary" disabled={cash < cost} title={costTitle(cash, cost)} onClick={() => buildRoom(room.id)} testId={`build-btn-${room.id}`}>
              {formatMoney(cost)}
            </Button>
          )}
        </div>
      </div>
    );
  }
  const maxed = room.level >= MAX_ROOM_LEVEL;
  const cost = roomUpgradeCost(room.level);
  return (
    <div className={compact ? "" : "rounded-button border border-line bg-raised p-3"} data-testid={`upgrade-${room.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {!compact && <span className="font-pixel text-lg text-ink">{def.name}</span>}
            <Pips level={room.level} max={MAX_ROOM_LEVEL} color={def.color} />
          </div>
          {effect && <div className="text-xs text-ink2">{effect}</div>}
        </div>
        {maxed ? (
          <span className="font-pixel text-md text-ink2">MAX</span>
        ) : (
          <Button color={def.color} disabled={cash < cost} title={costTitle(cash, cost)} onClick={() => upgradeRoom(room.id)} testId={`upgrade-btn-${room.id}`}>
            Lv{room.level + 1} · {formatMoney(cost)}
          </Button>
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
    <div className="rounded-button border border-dashed border-line bg-raised/60 p-3" data-testid={`build-${room.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-pixel text-lg text-ink">Empty slot · floor {(game?.building.floors ?? 0) - room.floor}</div>
          <div className="text-xs text-ink2">Pick what to build here.</div>
        </div>
        {!compact && (
          <Button color={T.purple} icon="plus" onClick={() => setOpen(!open)} testId={`choose-${room.id}`}>
            {open ? "Hide" : "Choose"}
          </Button>
        )}
      </div>
      {open && (
        <ul className="stagger mt-3 grid grid-cols-1 gap-2">
          {options.map((t) => {
            const def = ROOM_DEFS[t];
            const cost = BUILD_COST[t] ?? 0;
            return (
              <li key={t} className="flex items-center justify-between gap-3 rounded-button border border-line bg-surface p-2">
                <div className="min-w-0">
                  <div className="font-pixel text-md" style={{ color: def.color }}>
                    {def.name}
                    {UNIQUE_ROOMS.includes(t) ? <span className="ml-1 text-xs text-muted">unique</span> : null}
                  </div>
                  <div className="text-xs leading-tight text-ink2">{ROOM_EFFECT[t]}</div>
                </div>
                <Button color={def.color} disabled={cash < cost} title={costTitle(cash, cost)} onClick={() => buildRoom(room.id, t)} testId={`build-${room.id}-${t}`}>
                  {formatMoney(cost)}
                </Button>
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
  const floorCost = addFloorCost(game.building.floors);

  return (
    <div data-testid="build-content">
      <Section title={`New rooms · ${locked.length}`}>
        {locked.length === 0 ? (
          <Empty icon="build" text={canAddFloor ? "Every slot is built. Add a floor for more room." : "Every slot is built and the tower is at full height."} />
        ) : (
          <div className="stagger flex flex-col gap-2">
            {locked.map((r) => (
              <RoomBuildBox key={r.id} room={r} cash={game.cash} />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Floors · ${game.building.floors}/${MAX_FLOORS}`}>
        {canAddFloor ? (
          <div className="flex items-center justify-between gap-3 rounded-button border border-line bg-raised p-3">
            <div className="text-xs text-ink2">A new top floor with 4 empty slots. Rent goes up with every floor.</div>
            <Button color={T.cyan} variant="primary" icon="plus" disabled={game.cash < floorCost} title={costTitle(game.cash, floorCost)} onClick={addFloor} testId="add-floor">
              {formatMoney(floorCost)}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink2">The building is at its maximum height.</p>
        )}
      </Section>

      <Section title="Shop upgrades">
        <div className="flex flex-col gap-2">
          {UPGRADE_IDS.map((id) => {
            const def = SHOP_UPGRADES[id];
            const lvl = game.upgrades[id] ?? 0;
            const cost = upgradeCost(id, lvl);
            return (
              <div key={id} className="flex items-center justify-between gap-3 rounded-button border border-line bg-raised p-3" data-testid={`shop-${id}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-lg text-ink">{def.name}</span>
                    <Pips level={lvl} max={MAX_UPGRADE_LEVEL} color={T.yellow} />
                  </div>
                  <div className="text-xs text-ink2">{def.blurb}</div>
                </div>
                {cost === null ? (
                  <span className="font-pixel text-md text-ink2">MAX</span>
                ) : (
                  <Button color={T.yellow} disabled={game.cash < cost} title={costTitle(game.cash, cost)} onClick={() => buyUpgrade(id)} testId={`buy-${id}`}>
                    {formatMoney(cost)}
                  </Button>
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
    <Panel title="Build" icon="build" accent={T.purple} onClose={onClose} testId="panel-build">
      <p className="mb-2 text-sm text-ink2">
        Cash <span className="font-pixel text-md text-yellow">{formatMoney(game.cash)}</span>
      </p>
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
    <Panel
      title="Hire"
      icon="hire"
      accent={T.green}
      onClose={onClose}
      testId="panel-hire"
      footer={
        <Button color={T.cyan} icon="crew" disabled={game.cash < REROLL_COST} title={costTitle(game.cash, REROLL_COST)} onClick={reroll} testId="reroll" full>
          New shortlist · {formatMoney(REROLL_COST)}
        </Button>
      }
    >
      <p className="text-sm text-ink2">
        Crew {game.workers.length}/{cap}. Hiring costs one day&apos;s salary as a signing bonus. A new shortlist arrives every day.
      </p>
      {full && <p className="mt-2 text-sm text-red">The building is full. Build an Open Office for more desks.</p>}
      <ul className="stagger mt-3 flex flex-col gap-2">
        {game.candidates.map((c) => (
          <li key={c.id} className="rounded-button border border-line bg-raised p-3" data-testid="candidate">
            <div className="flex gap-3">
              <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded-button bg-surface">
                <Portrait look={c.look} scale={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-pixel text-lg leading-none text-ink">{c.name}</span>
                  <span className="font-pixel text-md text-yellow">{formatMoney(c.salary)}/day</span>
                </div>
                <div className="text-xs text-cyan">
                  {c.role} · {FOCUS_LABEL[c.focus]} · skill {c.skill}
                </div>
                <div className="text-xs text-ink2 italic">{c.personality}</div>
                <div className="text-xs text-ink2">{c.bio}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="soft" onClick={() => skip(c.id)}>
                Skip
              </Button>
              <Button variant="primary" color={T.green} icon="check" disabled={full || game.cash < c.salary} title={full ? "No desks left" : costTitle(game.cash, c.salary)} onClick={() => hire(c.id)} testId="hire-btn">
                Hire
              </Button>
            </div>
          </li>
        ))}
        {game.candidates.length === 0 && (
          <li>
            <Empty icon="hire" text="No candidates left today. A new shortlist arrives tomorrow, or pay a recruiter now." />
          </li>
        )}
      </ul>
      <p className="mt-3 flex items-center gap-1 text-xs text-muted">
        <Icon name="clock" size={10} /> Signing bonus is paid once; salary is paid daily at midnight.
      </p>
    </Panel>
  );
}
