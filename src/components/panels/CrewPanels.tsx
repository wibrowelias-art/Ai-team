"use client";

import { findRoom, floorBase, ROOM_DEFS } from "@/game/building";
import { FOCUS_LABEL } from "@/game/business";
import { COLORS } from "@/game/constants";
import { useGame } from "@/game/store";
import PayBox, { FireBox, FOCUSES } from "./PayBox";
import { formatMoney } from "@/game/time";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { activityLabel, moodEmoji, NeonButton, Section, Soon, StatBar } from "../ui";
import { usePolledGame } from "../usePolled";

export function CrewPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame();
  const openPanel = useGame((s) => s.openPanel);
  const focusOn = useGame((s) => s.focusOn);
  if (!game) return null;
  const payroll = game.workers.reduce((a, w) => a + w.salary, 0);

  return (
    <Panel title={`Crew · ${game.workers.length}`} accent={COLORS.cyan} onClose={onClose} testId="panel-crew">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-pixel text-[15px] text-white/60">
          Payroll <span className="text-hud">{formatMoney(payroll)}</span>/day
        </p>
        <div className="flex gap-1.5">
          <NeonButton color={COLORS.green} onClick={() => openPanel({ id: "hire" })} testId="open-hire">
            + Hire
          </NeonButton>
          <NeonButton color={COLORS.red} onClick={() => openPanel({ id: "meeting" })} testId="open-meeting">
            📣 Meeting
          </NeonButton>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {game.workers.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              data-testid={`crew-${w.id}`}
              onClick={() => {
                openPanel({ id: "worker", ref: w.id });
                focusOn(w.x, floorBase(w.floor) - 8);
              }}
              className="flex w-full items-center gap-3 rounded border border-white/10 bg-black/20 p-2 text-left hover:border-cyan/50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-ink2">
                <Portrait look={w.look} scale={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-pixel text-lg leading-none text-white">{w.name}</span>
                  <span className="text-base leading-none">{moodEmoji(w.mood)}</span>
                </div>
                <div className="truncate text-[11px] text-cyan/80">{w.role}</div>
                <div className="truncate text-[11px] text-white/50">{activityLabel(w, game.building)}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3">
                  <MiniBar value={w.energy} color={COLORS.yellow} />
                  <MiniBar value={w.mood} color={COLORS.pink} />
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 overflow-hidden rounded bg-white/10">
      <div className="h-full" style={{ width: `${Math.round(value)}%`, background: color }} />
    </div>
  );
}

export function WorkerPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const game = usePolledGame();
  const focusOn = useGame((s) => s.focusOn);
  const setFocus = useGame((s) => s.setFocus);
  const openChat = useGame((s) => s.openPanel);
  const w = game?.workers.find((x) => x.id === id);
  if (!game || !w) return null;
  const thread = game.chats[w.id] ?? [];
  const mission = game.missions.find((m) => m.workerId === w.id && m.status === "active");
  const home = findRoom(game.building, w.homeRoom);
  const rels = Object.entries(w.relationships)
    .map(([oid, v]) => ({ name: game.workers.find((o) => o.id === oid)?.name, v }))
    .filter((r) => r.name)
    .sort((a, b) => b.v - a.v);

  return (
    <Panel title={w.name} accent={w.look.outfit} onClose={onClose} testId="panel-worker">
      <div className="flex gap-4">
        <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded border border-white/10 bg-ink2">
          <Portrait look={w.look} scale={4.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-lg leading-tight text-cyan">{w.role}</div>
          <p className="mt-1 text-xs text-white/60 italic">{w.personality}</p>
          <p className="mt-2 text-xs text-white/80">{activityLabel(w, game.building)}</p>
          <p className="text-xs text-white/50">Home: {home ? ROOM_DEFS[home.type].name : "—"}</p>
        </div>
      </div>

      <Section title="Vitals">
        <div className="flex flex-col gap-1.5">
          <StatBar label="Mood" value={w.mood} color={COLORS.pink} />
          <StatBar label="Energy" value={w.energy} color={COLORS.yellow} />
          <StatBar label="Loyalty" value={w.loyalty} color={COLORS.purple} />
          <StatBar label="Skill" value={w.skill} color={COLORS.cyan} />
          <StatBar label="Speed" value={w.speed} color={COLORS.green} />
        </div>
      </Section>

      <Section title="Job">
        <div className="grid grid-cols-2 gap-2 font-pixel text-[15px]">
          <div className="rounded bg-black/30 p-2">
            <div className="text-white/50">Salary</div>
            <div className="text-hud">{formatMoney(w.salary)}/day</div>
          </div>
          <div className="rounded bg-black/30 p-2">
            <div className="text-white/50">Earned</div>
            <div className="text-neon-green">{formatMoney(w.earned)}</div>
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xs text-white/70">{w.task}</div>
          <StatBar label="Task" value={w.taskProgress} color={COLORS.green} />
        </div>
      </Section>

      <div className="mt-4 flex flex-wrap gap-2">
        <NeonButton onClick={() => focusOn(w.x, floorBase(w.floor) + w.y - 8)} testId="worker-locate">
          Locate
        </NeonButton>
        <NeonButton color={COLORS.pink} onClick={() => openChat({ id: "chat", ref: w.id })} testId="worker-chat">
          Chat
        </NeonButton>
      </div>

      <PayBox workerId={w.id} name={w.name} cash={game.cash} />

      <Section title="Business focus">
        <div className="flex flex-wrap gap-1">
          {FOCUSES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFocus(w.id, f)}
              aria-pressed={w.focus === f}
              data-testid={`focus-${f}`}
              className={`rounded border px-2 py-1 font-pixel text-[15px] ${
                w.focus === f ? "border-cyan bg-cyan/15 text-cyan" : "border-white/15 text-white/60 hover:text-white"
              }`}
            >
              {FOCUS_LABEL[f]}
            </button>
          ))}
        </div>
        {mission && (
          <p className="mt-2 text-[11px] text-cyan/80">
            On a mission: {mission.title} ({Math.floor(mission.progress)}/{mission.target})
          </p>
        )}
        {w.boost && w.boost.until > game.minutes && (
          <p className="mt-1 text-[11px] text-neon-green">Task budget: +{Math.round((w.boost.mult - 1) * 100)}% output</p>
        )}
      </Section>

      <Section title="Messages">
        {thread.length === 0 ? (
          <p className="text-xs text-white/40">No messages yet.</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="worker-messages">
            {thread.slice(-6).map((m) => (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                  m.from === "worker" ? "self-start bg-white/10 text-white" : "self-end bg-cyan/20 text-cyan"
                }`}
              >
                {m.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Relationships">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-pixel text-[15px]">
          {rels.map((r) => (
            <li key={r.name} className="flex justify-between">
              <span className="text-white/70">{r.name}</span>
              <span style={{ color: r.v > 10 ? COLORS.green : r.v < -10 ? COLORS.red : "#8a84b8" }}>
                {r.v > 0 ? `+${r.v}` : r.v}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Memories">
        {w.memories.length === 0 ? (
          <Soon>Nothing yet. Tell {w.name} something in chat and they will remember it (Phase 3).</Soon>
        ) : (
          <ul className="list-disc pl-4 text-xs text-white/70">
            {w.memories.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </Section>
      <FireBox workerId={w.id} name={w.name} salary={w.salary} />
    </Panel>
  );
}
