"use client";

import { useEffect, useRef } from "react";
import { floorBase } from "@/game/building";
import { COLORS } from "@/game/constants";
import { useGame } from "@/game/store";
import { formatDuration, formatMoney } from "@/game/time";
import Portrait from "./Portrait";
import { usePolledGame } from "./usePolled";

function Modal({ children, accent, testId, label }: { children: React.ReactNode; accent: string; testId: string; label: string }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 animate-fade" data-testid={testId}>
      <section
        role="alertdialog"
        aria-label={label}
        className="scroll-thin max-h-full w-full max-w-sm overflow-y-auto rounded-lg border-2 bg-panel/95 p-4"
        style={{ borderColor: accent, boxShadow: `0 0 28px -6px ${accent}` }}
      >
        {children}
      </section>
    </div>
  );
}

/** Popup for the oldest unanswered event. */
export function EventModal() {
  const ev = useGame((s) => s.game?.pendingEvents[0] ?? null);
  const away = useGame((s) => s.away);
  const resolve = useGame((s) => s.resolveEvent);
  if (!ev || away) return null;
  return (
    <Modal accent={COLORS.yellow} testId="event-modal" label={ev.title}>
      <h2 className="font-arcade text-[12px] leading-relaxed text-hud neon-text">{ev.title}</h2>
      <p className="mt-2 text-sm text-white/85">{ev.body}</p>
      <div className="mt-4 flex flex-col gap-2">
        {ev.choices.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => resolve(ev.id, i)}
            className="rounded border border-white/15 bg-black/30 p-2 text-left hover:border-hud/60"
            data-testid={`event-choice-${i}`}
          >
            <div className="font-pixel text-lg leading-tight text-white">{c.label}</div>
            <div className="text-[11px] text-white/55">{c.detail}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/35">No answer in 12 game hours picks “{ev.choices[ev.defaultChoice].label}”.</p>
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
    <Modal accent={COLORS.cyan} testId="away-modal" label="While you were away">
      <h2 className="font-arcade text-[12px] leading-relaxed text-cyan neon-text">While you were away</h2>
      <p className="mt-2 text-xs text-white/60">
        You were gone {realMin >= 60 ? formatDuration(realMin) : `${realMin} min`}. The crew kept working for {formatDuration(away.gameMinutes)} of game time
        {away.capped ? " (offline progress is capped at 3 game days)" : ""}.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-pixel">
        <div className="rounded bg-black/30 p-2">
          <dt className="text-[13px] text-white/50 uppercase">Revenue</dt>
          <dd className="text-xl text-neon-green" data-testid="away-revenue">
            +{formatMoney(away.revenue)}
          </dd>
        </div>
        <div className="rounded bg-black/30 p-2">
          <dt className="text-[13px] text-white/50 uppercase">Spent</dt>
          <dd className="text-xl text-danger">-{formatMoney(away.spent)}</dd>
        </div>
        {away.otherIncome !== 0 && (
          <div className="rounded bg-black/30 p-2">
            <dt className="text-[13px] text-white/50 uppercase">Other income</dt>
            <dd className="text-xl text-white">+{formatMoney(away.otherIncome)}</dd>
          </div>
        )}
        <div className="rounded bg-black/30 p-2">
          <dt className="text-[13px] text-white/50 uppercase">Cash</dt>
          <dd className={`text-xl ${delta >= 0 ? "text-hud" : "text-danger"}`} data-testid="away-cash">
            {delta >= 0 ? "+" : ""}
            {formatMoney(delta)}
          </dd>
        </div>
      </dl>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-white/75">
        <li>
          {formatMoney(away.cashBefore)} → <span className="text-hud">{formatMoney(away.cashAfter)}</span>
        </li>
        {away.daysPassed > 0 && <li>📅 {away.daysPassed} payday{away.daysPassed > 1 ? "s" : ""} passed</li>}
        {away.productsLaunched > 0 && <li>🏭 {away.productsLaunched} products went live (auto-approved)</li>}
        {away.events.map((e, i) => (
          <li key={i}>⚡ {e} (handled with the default choice)</li>
        ))}
        {away.leftCrew.length > 0 && <li className="text-danger">👋 {away.leftCrew.join(", ")} left the company</li>}
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="mt-4 w-full rounded bg-cyan py-2.5 font-arcade text-[10px] text-ink uppercase"
        data-testid="away-continue"
      >
        Back to work
      </button>
    </Modal>
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
    <div
      className={`pointer-events-none absolute inset-x-0 ${tutorialOn ? "top-[7.5rem]" : "top-12"} z-30 flex flex-col items-center gap-1.5 px-3`}
      aria-live="polite"
      data-testid="toasts"
    >
      {toasts.map((t) => {
        const w = t.workerId ? game?.workers.find((x) => x.id === t.workerId) : undefined;
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
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-lg animate-fade ${
              t.kind === "error" ? "border-danger/60 bg-[#2a0f18]/95 text-danger" : "border-cyan/40 bg-panel/95 text-white"
            }`}
            data-testid={t.kind === "message" ? "toast-message" : "toast"}
          >
            {w && <Portrait look={w.look} scale={1.5} />}
            <span className="min-w-0">
              {w && <span className="mr-1 font-pixel text-[15px] text-cyan">{w.name}:</span>}
              {t.text}
              {t.count && t.count > 1 ? <span className="ml-1 text-white/50">· {t.count} new</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
