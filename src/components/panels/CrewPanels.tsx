"use client";

import { findRoom, floorBase, ROOM_DEFS } from "@/game/building";
import { FOCUS_LABEL } from "@/game/business";
import { useGame } from "@/game/store";
import { formatMoney } from "@/game/time";
import { T } from "@/ui/tokens";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { activityLabel, Button, Chip, Empty, moodLabel, Row, Section, Stat, StatBar } from "../ui";
import { usePolledGame } from "../usePolled";
import PayBox, { FireBox, FOCUSES } from "./PayBox";

export function CrewPanel({ onClose }: { onClose: () => void }) {
  const game = usePolledGame();
  const openPanel = useGame((s) => s.openPanel);
  const focusOn = useGame((s) => s.focusOn);
  if (!game) return null;
  const payroll = game.workers.reduce((a, w) => a + w.salary, 0);

  return (
    <Panel
      title={`Crew · ${game.workers.length}`}
      icon="crew"
      accent={T.cyan}
      onClose={onClose}
      testId="panel-crew"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button color={T.green} icon="hire" onClick={() => openPanel({ id: "hire" })} testId="open-hire" full>
            Hire
          </Button>
          <Button color={T.red} icon="meeting" onClick={() => openPanel({ id: "meeting" })} testId="open-meeting" full>
            Meeting
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-ink2">
        Payroll <span className="font-pixel text-md text-yellow">{formatMoney(payroll)}</span>/day
      </p>
      <ul className="stagger flex flex-col gap-2">
        {game.workers.map((w) => {
          const mood = moodLabel(w.mood);
          return (
            <li key={w.id}>
              <Row
                testId={`crew-${w.id}`}
                onClick={() => {
                  openPanel({ id: "worker", ref: w.id });
                  focusOn(w.x, floorBase(w.floor) - 8);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-button bg-surface">
                    <Portrait look={w.look} scale={2.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-pixel text-lg leading-none text-ink">{w.name}</span>
                      <span className="font-pixel text-sm" style={{ color: mood.color }}>
                        {mood.text}
                      </span>
                    </div>
                    <div className="truncate text-xs text-cyan">{w.role}</div>
                    <div className="truncate text-xs text-ink2">{activityLabel(w, game.building)}</div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                      <MiniBar label="Energy" value={w.energy} color={T.yellow} />
                      <MiniBar label="Mood" value={w.mood} color={T.pink} />
                    </div>
                  </div>
                </div>
              </Row>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} ${Math.round(value)}`}>
      <span className="w-10 font-pixel text-xs text-muted uppercase">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface">
        <div className="h-full" style={{ width: `${Math.round(value)}%`, background: color }} />
      </div>
    </div>
  );
}

export function WorkerPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const game = usePolledGame();
  const focusOn = useGame((s) => s.focusOn);
  const setFocus = useGame((s) => s.setFocus);
  const openPanel = useGame((s) => s.openPanel);
  const w = game?.workers.find((x) => x.id === id);
  if (!game || !w) return null;
  const thread = game.chats[w.id] ?? [];
  const mission = game.missions.find((m) => m.workerId === w.id && m.status === "active");
  const home = findRoom(game.building, w.homeRoom);
  const mood = moodLabel(w.mood);
  const rels = Object.entries(w.relationships)
    .map(([oid, v]) => ({ name: game.workers.find((o) => o.id === oid)?.name, v }))
    .filter((r) => r.name)
    .sort((a, b) => b.v - a.v);

  return (
    <Panel
      title={w.name}
      icon="crew"
      accent={w.look.outfit}
      onClose={onClose}
      testId="panel-worker"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button icon="arrow" onClick={() => focusOn(w.x, floorBase(w.floor) + w.y - 8)} testId="worker-locate" full>
            Locate
          </Button>
          <Button color={T.pink} variant="primary" icon="chat" onClick={() => openPanel({ id: "chat", ref: w.id })} testId="worker-chat" full>
            Chat
          </Button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-button border border-line bg-raised">
          <Portrait look={w.look} scale={4.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-lg leading-tight text-cyan">{w.role}</div>
          <p className="mt-1 text-sm text-ink2 italic">{w.personality}</p>
          <p className="mt-2 text-sm text-ink">{activityLabel(w, game.building)}</p>
          <p className="text-sm text-ink2">
            Home: {home ? ROOM_DEFS[home.type].name : "—"} · Mood <span style={{ color: mood.color }}>{mood.text}</span>
          </p>
        </div>
      </div>

      <Section title="Vitals">
        <div className="flex flex-col gap-2">
          <StatBar label="Mood" value={w.mood} color={T.pink} />
          <StatBar label="Energy" value={w.energy} color={T.yellow} />
          <StatBar label="Loyalty" value={w.loyalty} color={T.purple} />
          <StatBar label="Skill" value={w.skill} color={T.cyan} />
          <StatBar label="Speed" value={w.speed} color={T.green} />
        </div>
      </Section>

      <Section title="Job">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Salary" value={`${formatMoney(w.salary)}/day`} color={T.yellow} />
          <Stat label="Earned" value={formatMoney(w.earned, true)} color={T.green} small="for the company" />
        </div>
        <div className="mt-3">
          <div className="mb-1 text-sm text-ink">{w.task}</div>
          <StatBar label="Task" value={w.taskProgress} color={T.green} />
        </div>
        {mission && (
          <p className="mt-2 text-sm text-cyan">
            Mission: {mission.title} ({Math.floor(mission.progress)}/{mission.target})
          </p>
        )}
        {w.boost && w.boost.until > game.minutes && <p className="mt-1 text-sm text-green">Task budget active: +{Math.round((w.boost.mult - 1) * 100)}% output</p>}
      </Section>

      <PayBox workerId={w.id} name={w.name} cash={game.cash} />

      <Section title="Business focus">
        <div className="flex flex-wrap gap-2">
          {FOCUSES.map((f) => (
            <Chip key={f} active={w.focus === f} onClick={() => setFocus(w.id, f)} testId={`focus-${f}`}>
              {FOCUS_LABEL[f]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Messages" right={thread.length > 0 ? <button type="button" className="pressable flex h-11 items-center px-2 text-sm text-cyan" onClick={() => openPanel({ id: "chat", ref: w.id })}>Open chat</button> : undefined}>
        {thread.length === 0 ? (
          <Empty icon="chat" text={`${w.name} hasn't texted you yet. Say hi and they will remember what you tell them.`} action={<Button color={T.pink} icon="chat" onClick={() => openPanel({ id: "chat", ref: w.id })}>Say hi</Button>} />
        ) : (
          <ul className="flex flex-col gap-1" data-testid="worker-messages">
            {thread.slice(-5).map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-button px-3 py-2 text-sm ${m.from === "worker" ? "self-start bg-raised text-ink" : "self-end bg-cyan/15 text-cyan"}`}>
                {m.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Relationships">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {rels.map((r) => (
            <li key={r.name} className="flex justify-between text-sm">
              <span className="text-ink2">{r.name}</span>
              <span className="font-pixel text-md" style={{ color: r.v > 10 ? T.green : r.v < -10 ? T.red : T.muted }}>
                {r.v > 0 ? `+${r.v}` : r.v}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Memories">
        {w.memories.length === 0 ? (
          <Empty icon="star" text={`Nothing yet. Tell ${w.name} something in chat ("my favorite color is green") and they will bring it up later.`} />
        ) : (
          <ul className="list-disc pl-4 text-sm text-ink2">
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
