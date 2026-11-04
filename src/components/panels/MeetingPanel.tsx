"use client";

import { useEffect, useRef, useState } from "react";
import { closeMeeting, meetingSay, startMeeting } from "@/game/aiStore";
import { COLORS } from "@/game/constants";
import { useGame } from "@/game/store";
import type { GameState } from "@/game/types";
import Portrait from "../Portrait";
import { NeonButton, Section } from "../ui";

const TOPICS = ["next product", "marketing push", "cut costs", "team morale", "music strategy"];

/** War Room content: call a meeting, watch the live transcript, chime in. */
export function MeetingContent({ game }: { game: GameState }) {
  const meeting = useGame((s) => s.meeting);
  return meeting ? <LiveMeetingView game={game} /> : <MeetingForm game={game} />;
}

function MeetingForm({ game }: { game: GameState }) {
  const [topic, setTopic] = useState("");
  const available = game.workers;
  const [picked, setPicked] = useState<string[]>(() =>
    available
      .filter((w) => w.activity !== "resting")
      .slice(0, 5)
      .map((w) => w.id),
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const last = game.meetings[game.meetings.length - 1];

  return (
    <div data-testid="meeting-form">
      <Section title="Call a meeting">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={100}
          placeholder="Topic, e.g. next product"
          className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-danger"
          data-testid="meeting-topic"
          aria-label="Meeting topic"
        />
        <div className="scroll-thin -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:border-danger/60"
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {available.map((w) => {
            const on = picked.includes(w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggle(w.id)}
                aria-pressed={on}
                data-testid={`attendee-${w.id}`}
                className={`flex items-center gap-2 rounded border px-2 py-1 text-left ${on ? "border-danger/70 bg-danger/10" : "border-white/10 opacity-60"}`}
              >
                <Portrait look={w.look} scale={1.5} />
                <span className="font-pixel text-base text-white">{w.name}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <NeonButton
            color={COLORS.red}
            onClick={() => void startMeeting(topic, picked)}
            disabled={!topic.trim() || picked.length < 2}
            testId="meeting-start"
          >
            Start meeting ({picked.length})
          </NeonButton>
        </div>
      </Section>
      {last && (
        <Section title={`Last meeting · ${last.topic}`}>
          <ul className="text-xs text-white/70">
            {last.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function LiveMeetingView({ game }: { game: GameState }) {
  const meeting = useGame((s) => s.meeting)!;
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const visible = meeting.lines.slice(0, meeting.shown);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [meeting.shown, meeting.busy]);

  const byName = new Map(game.workers.map((w) => [w.name, w]));
  const waiting = meeting.busy || meeting.shown < meeting.lines.length;

  return (
    <div data-testid="meeting-live">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-pixel text-lg text-danger">“{meeting.topic}”</h3>
        <span className="text-[10px] text-white/40">{meeting.source === "ai" ? "live" : meeting.source === "script" ? "scripted" : ""}</span>
      </div>
      <ul ref={listRef} className="scroll-thin mt-2 flex max-h-[34vh] flex-col gap-1.5 overflow-y-auto" data-testid="meeting-transcript">
        {visible.map((l, i) => {
          const w = byName.get(l.speaker);
          return (
            <li key={i} className={`flex items-start gap-2 ${l.speaker === "You" ? "flex-row-reverse" : ""}`} data-testid="meeting-line">
              {w ? <Portrait look={w.look} scale={1.5} /> : <span className="w-[18px]" />}
              <div className={`rounded-lg px-2.5 py-1.5 text-xs ${l.speaker === "You" ? "bg-cyan/20 text-white" : "bg-white/8 text-white/90"}`}>
                <span className="mr-1 font-pixel text-[15px] text-danger">{l.speaker}</span>
                {l.text}
              </div>
            </li>
          );
        })}
        {waiting && meeting.status === "running" && (
          <li className="text-[11px] text-white/40">{meeting.busy ? "The crew is thinking…" : "…"}</li>
        )}
      </ul>

      {meeting.status === "done" && meeting.outcomes && (
        <Section title="Decisions">
          <ul className="flex flex-col gap-1 text-xs" data-testid="meeting-decisions">
            {meeting.outcomes.map((o, i) => (
              <li key={i} className={o.applied ? "text-neon-green" : "text-white/50"}>
                {o.applied ? "✓" : "•"} {o.summary}
                {!o.applied && o.note !== "noted" ? ` (${o.note})` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {meeting.status === "running" ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !meeting.busy) {
              void meetingSay(text);
              setText("");
            }
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Say something to the room…"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-danger"
            data-testid="meeting-input"
          />
          <button type="submit" disabled={!text.trim() || meeting.busy} className="rounded-lg bg-danger/80 px-3 font-pixel text-lg text-white disabled:opacity-40">
            Say
          </button>
        </form>
      ) : null}

      <div className="mt-3">
        <NeonButton color={meeting.status === "done" ? COLORS.cyan : COLORS.red} onClick={closeMeeting} testId="meeting-close">
          {meeting.status === "done" ? "Back to work" : "End early"}
        </NeonButton>
      </div>
    </div>
  );
}
