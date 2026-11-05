"use client";

import { useEffect, useRef } from "react";
import { floorBase } from "@/game/building";
import { useGame } from "@/game/store";
import { formatDuration, formatMoney } from "@/game/time";
import type { GameEvent } from "@/game/types";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";
import Portrait from "./Portrait";
import { Button } from "./ui";
import { usePolledGame } from "./usePolled";

function Modal({ children, accent, testId, label }: { children: React.ReactNode; accent: string; testId: string; label: string }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 animate-fade" data-testid={testId}>
      <section role="alertdialog" aria-label={label} className="panel-surface scroll-thin max-h-full w-full max-w-sm animate-pop overflow-y-auto rounded-panel p-4" style={{ ["--accent" as string]: accent }}>
        {children}
      </section>
    </div>
  );
}

const EVENT_STYLE: Record<GameEvent["kind"], { icon: IconName; color: string }> = {
  viral: { icon: "star", color: T.pink },
  refund: { icon: "warn", color: T.orange },
  investor: { icon: "briefcase", color: T.green },
  poaching: { icon: "hire", color: T.purple },
  outage: { icon: "bolt", color: T.red },
  drama: { icon: "crew", color: T.yellow },
};

/** Popup for the oldest unanswered event. */
export function EventModal() {
  const ev = useGame((s) => s.game?.pendingEvents[0] ?? null);
  const away = useGame((s) => s.away);
  const resolve = useGame((s) => s.resolveEvent);
  if (!ev || away) return null;
  const st = EVENT_STYLE[ev.kind];
  const title = ev.title.replace(/[^\w\s'!?-]/gu, "").trim();
  return (
    <Modal accent={st.color} testId="event-modal" label={title}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-button" style={{ background: `color-mix(in srgb, ${st.color} 18%, transparent)`, color: st.color }}>
          <Icon name={st.icon} size={20} />
        </span>
        <div>
          <div className="font-pixel text-xs tracking-[0.2em] text-ink2 uppercase">Event</div>
          <h2 className="font-arcade text-xs leading-relaxed neon-text" style={{ color: st.color }}>
            {title}
          </h2>
        </div>
      </div>
      <p className="mt-3 text-md text-ink">{ev.body}</p>
      <div className="stagger mt-4 flex flex-col gap-2">
        {ev.choices.map((c, i) => (
          <button key={c.label} type="button" onClick={() => resolve(ev.id, i)} className="pressable rounded-button border border-line bg-raised p-3 text-left hover:border-ink2/50" style={{ ["--glow" as string]: st.color }} data-testid={`event-choice-${i}`}>
            <div className="font-pixel text-lg leading-tight text-ink">{c.label}</div>
            <div className="text-sm text-ink2">{c.detail}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="clock" size={10} /> No answer in 12 game hours picks “{ev.choices[ev.defaultChoice].label}”.
      </p>
    </Modal>
  );
}

export function AwayModal() {
  const away = useGame((s) => s.away);
  const dismiss = useGame((s) => s.dismissAway);
  if (!away) return null;
  const delta = away.cashAfter - away.cashBefore;
  const realMin = Math.round(away.realMs / 60000);
  return (
    <Modal accent={T.cyan} testId="away-modal" label="While you were away">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-button bg-cyan/15 text-cyan">
          <Icon name="moon" size={20} />
        </span>
        <h2 className="font-arcade text-xs leading-relaxed text-cyan neon-text">While you were away</h2>
      </div>
      <p className="mt-3 text-sm text-ink2">
        You were gone {realMin >= 60 ? formatDuration(realMin) : `${realMin} min`}. The crew kept working for {formatDuration(away.gameMinutes)} of game time
        {away.capped ? " (offline progress is capped at 3 game days)" : ""}.
      </p>
      <dl className="stagger mt-3 grid grid-cols-2 gap-3">
        <Tile label="Revenue" value={`+${formatMoney(away.revenue)}`} color={T.green} testId="away-revenue" />
        <Tile label="Spent" value={`-${formatMoney(away.spent)}`} color={T.red} />
        {away.otherIncome !== 0 && <Tile label="Other income" value={`+${formatMoney(away.otherIncome)}`} color={T.text} />}
        <Tile label="Cash" value={`${delta >= 0 ? "+" : ""}${formatMoney(delta)}`} color={delta >= 0 ? T.yellow : T.red} testId="away-cash" />
      </dl>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-ink">
        <li>
          {formatMoney(away.cashBefore)} → <span className="text-yellow">{formatMoney(away.cashAfter)}</span>
        </li>
        {away.daysPassed > 0 && <li>{away.daysPassed} payday{away.daysPassed > 1 ? "s" : ""} passed</li>}
        {away.productsLaunched > 0 && <li>{away.productsLaunched} products went live (auto-approved)</li>}
        {away.events.map((e, i) => (
          <li key={i} className="text-ink2">
            {e} (handled with the default choice)
          </li>
        ))}
        {away.leftCrew.length > 0 && <li className="text-red">{away.leftCrew.join(", ")} left the company</li>}
      </ul>
      <div className="mt-4">
        <Button variant="primary" onClick={dismiss} testId="away-continue" full>
          Back to work
        </Button>
      </div>
    </Modal>
  );
}

function Tile({ label, value, color, testId }: { label: string; value: string; color: string; testId?: string }) {
  return (
    <div className="rounded-button border border-line bg-raised p-3">
      <dt className="font-pixel text-sm tracking-widest text-ink2 uppercase">{label}</dt>
      <dd className="font-pixel text-xl" style={{ color }} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

const TOAST_MS = 4500;

/** Toasts for errors, plus a toast whenever a worker texts the player. */
export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const toast = useGame((s) => s.toast);
  const openPanel = useGame((s) => s.openPanel);
  const focusOn = useGame((s) => s.focusOn);
  const game = usePolledGame(200);
  const tutorialOn = useGame((s) => !!s.game && !s.game.tutorial.done);
  const seen = useRef<Set<string> | null>(null);

  // Watch chat threads for new worker messages.
  useEffect(() => {
    if (!game) return;
    const all = Object.values(game.chats).flat();
    if (seen.current === null) {
      seen.current = new Set(all.map((m) => m.id));
      return;
    }
    for (const [workerId, thread] of Object.entries(game.chats)) {
      for (const m of thread) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        // No toast for the chat that is already open on screen, or for old messages (e.g. an imported save).
        const open = useGame.getState().panel;
        const watching = open?.id === "chat" && open.ref === workerId;
        const fresh = m.t >= game.minutes - 10;
        if (m.from === "worker" && !watching && fresh) toast(m.text, "message", workerId);
      }
    }
  }, [game, toast]);

  // One timer per toast, started when it first appears.
  const timers = useRef(new Map<number, number>());
  useEffect(() => {
    const map = timers.current;
    for (const t of toasts) {
      if (!map.has(t.id)) map.set(t.id, window.setTimeout(() => dismiss(t.id), TOAST_MS));
    }
    for (const [id, handle] of map) {
      if (!toasts.some((t) => t.id === id)) {
        window.clearTimeout(handle);
        map.delete(id);
      }
    }
  }, [toasts, dismiss]);
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((handle) => window.clearTimeout(handle));
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-x-0 ${tutorialOn ? "top-[8.5rem]" : "top-14"} z-30 flex flex-col items-center gap-2 px-3 md:items-end md:pr-4`} aria-live="polite" data-testid="toasts">
      {toasts.map((t) => {
        const w = t.workerId ? game?.workers.find((x) => x.id === t.workerId) : undefined;
        const error = t.kind === "error";
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => {
              dismiss(t.id);
              if (w) {
                openPanel({ id: t.kind === "message" ? "chat" : "worker", ref: w.id });
                focusOn(w.x, floorBase(w.floor) - 8);
              }
            }}
            className="panel-surface pointer-events-auto flex w-full max-w-sm animate-pop items-center gap-3 rounded-button px-3 py-2.5 text-left text-sm"
            style={{ ["--accent" as string]: error ? T.red : T.cyan, color: error ? T.red : T.text }}
            data-testid={t.kind === "message" ? "toast-message" : "toast"}
          >
            {w ? <Portrait look={w.look} scale={1.5} /> : <Icon name={error ? "warn" : "bolt"} size={14} color={error ? T.red : T.cyan} />}
            <span className="min-w-0">
              {w && <span className="mr-1 font-pixel text-md text-cyan">{w.name}:</span>}
              {t.text}
              {t.count && t.count > 1 ? <span className="ml-1 text-ink2">· {t.count} new</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
