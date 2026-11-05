"use client";

import { useEffect, useRef, useState } from "react";
import { closeMeeting, meetingSay, startMeeting } from "@/game/aiStore";
import { useGame } from "@/game/store";
import type { GameState } from "@/game/types";
import { Icon } from "@/ui/icons";
import { T } from "@/ui/tokens";
import Portrait from "../Portrait";
import { Button, Chip, Section } from "../ui";

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
          className="h-11 w-full rounded-button border border-line bg-raised px-3 text-md text-ink outline-none focus:border-red"
          data-testid="meeting-topic"
          aria-label="Meeting topic"
        />
        <div className="scroll-thin -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {TOPICS.map((t) => (
            <Chip key={t} color={T.red} active={topic === t} onClick={() => setTopic(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {available.map((w) => {
            const on = picked.includes(w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggle(w.id)}
                aria-pressed={on}
                data-testid={`attendee-${w.id}`}
                className="pressable flex min-h-11 items-center gap-2 rounded-button border px-2 text-left"
                style={{ borderColor: on ? T.red : T.border, background: on ? `color-mix(in srgb, ${T.red} 12%, transparent)` : T.raised, opacity: on ? 1 : 0.7, ["--glow" as string]: T.red }}
              >
                <Portrait look={w.look} scale={1.5} />
                <span className="font-pixel text-md text-ink">{w.name}</span>
                {on && <Icon name="check" size={10} color={T.red} className="ml-auto" />}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <Button variant="primary" color={T.red} icon="meeting" onClick={() => void startMeeting(topic, picked)} disabled={!topic.trim() || picked.length < 2} title={!topic.trim() ? "Pick a topic first" : picked.length < 2 ? "Pick at least 2 people" : undefined} testId="meeting-start" full>
            Start meeting ({picked.length})
          </Button>
        </div>
      </Section>
      {last && (
        <Section title={`Last meeting · ${last.topic}`}>
          <ul className="text-sm text-ink2">
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
      <h3 className="font-pixel text-lg text-red">“{meeting.topic}”</h3>
      <ul ref={listRef} className="scroll-thin mt-2 flex max-h-[34vh] flex-col gap-2 overflow-y-auto" data-testid="meeting-transcript">
        {visible.map((l, i) => {
          const w = byName.get(l.speaker);
          const you = l.speaker === "You";
          return (
            <li key={i} className={`animate-pop flex items-start gap-2 ${you ? "flex-row-reverse" : ""}`} data-testid="meeting-line">
              {w ? <Portrait look={w.look} scale={1.5} /> : <span className="w-[18px]" />}
              <div className={`rounded-button px-3 py-2 text-sm ${you ? "bg-cyan/15 text-ink" : "bg-raised text-ink"}`}>
                <span className="mr-1.5 font-pixel text-md" style={{ color: you ? T.cyan : T.red }}>
                  {l.speaker}
                </span>
                {l.text}
              </div>
            </li>
          );
        })}
        {waiting && meeting.status === "running" && (
          <li className="flex items-center gap-2 text-xs text-ink2">
            <TypingDots /> {meeting.busy ? "the crew is thinking" : ""}
          </li>
        )}
      </ul>

      {meeting.status === "done" && meeting.outcomes && (
        <Section title="Decisions">
          <ul className="stagger flex flex-col gap-1 text-sm" data-testid="meeting-decisions">
            {meeting.outcomes.map((o, i) => (
              <li key={i} data-applied={o.applied ? "true" : "false"} className="flex items-start gap-2" style={{ color: o.applied ? T.green : T.text2 }}>
                <Icon name={o.applied ? "check" : "clock"} size={10} className="mt-1 shrink-0" />
                <span>
                  {o.summary}
                  {!o.applied && o.note !== "noted" ? ` (${o.note})` : ""}
                </span>
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
            className="h-11 min-w-0 flex-1 rounded-button border border-line bg-raised px-3 text-md text-ink outline-none focus:border-red"
            data-testid="meeting-input"
          />
          <Button type="submit" variant="primary" color={T.red} disabled={!text.trim() || meeting.busy}>
            Say
          </Button>
        </form>
      ) : null}

      <div className="mt-3">
        <Button color={meeting.status === "done" ? T.cyan : T.red} variant={meeting.status === "done" ? "primary" : "ghost"} onClick={closeMeeting} testId="meeting-close" full>
          {meeting.status === "done" ? "Back to work" : "End early"}
        </Button>
      </div>
    </div>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink2" style={{ animation: `typing-dot 1.1s ${i * 150}ms infinite` }} />
      ))}
    </span>
  );
}
