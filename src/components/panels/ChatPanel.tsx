"use client";

import { useEffect, useRef, useState } from "react";
import { answerRaise, chatBonus, sendChat } from "@/game/aiStore";
import { floorBase } from "@/game/building";
import { useGame } from "@/game/store";
import { clockOf } from "@/game/time";
import type { ChatMessage } from "@/game/types";
import { Icon } from "@/ui/icons";
import { T } from "@/ui/tokens";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { Button, Chip, moodLabel } from "../ui";
import { usePolledGame } from "../usePolled";
import { TypingDots } from "./MeetingPanel";

const QUICK: { label: string; say?: string; bonus?: number }[] = [
  { label: "Good job", say: "good job today!" },
  { label: "Bonus $100", bonus: 100 },
  { label: "Go to the shop", say: "go work on the shop" },
  { label: "What are you working on?", say: "what are you working on?" },
];

export default function ChatPanel({ workerId, onClose }: { workerId: string; onClose: () => void }) {
  const game = usePolledGame(150);
  const pending = useGame((s) => !!s.chatPending[workerId]);
  const openPanel = useGame((s) => s.openPanel);
  const focusOn = useGame((s) => s.focusOn);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const w = game?.workers.find((x) => x.id === workerId);
  const thread = game?.chats[workerId] ?? [];
  const count = thread.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, pending]);

  if (!game || !w) return null;
  const mood = moodLabel(w.mood);

  const send = (msg: string) => {
    if (!msg.trim() || pending) return;
    void sendChat(workerId, msg);
    setText("");
  };

  // A player message is "read" once a worker message follows it.
  const lastWorkerIdx = thread.map((m) => m.from).lastIndexOf("worker");

  const footer = (
    <div className="flex flex-col gap-2">
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {QUICK.map((q) => (
          <Chip key={q.label} color={q.bonus ? T.yellow : T.cyan} disabled={pending || (q.bonus !== undefined && game.cash < q.bonus)} onClick={() => (q.bonus ? chatBonus(workerId, q.bonus) : send(q.say!))}>
            {q.label}
          </Chip>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={`Message ${w.name}…`}
          aria-label={`Message ${w.name}`}
          className="h-11 min-w-0 flex-1 rounded-button border border-line bg-raised px-3 text-md text-ink outline-none focus:border-cyan"
          data-testid="chat-input"
          enterKeyHint="send"
        />
        <Button type="submit" variant="primary" disabled={!text.trim() || pending} testId="chat-send">
          Send
        </Button>
      </form>
    </div>
  );

  return (
    <Panel title={w.name} icon="chat" accent={w.look.outfit} onClose={onClose} testId="panel-chat" footer={footer}>
      <button
        type="button"
        onClick={() => {
          openPanel({ id: "worker", ref: w.id });
          focusOn(w.x, floorBase(w.floor) - 8);
        }}
        className="pressable -mx-1 flex min-h-11 w-[calc(100%+8px)] items-center gap-3 rounded-button px-1 text-left hover:bg-raised"
        aria-label={`Open ${w.name}'s profile`}
      >
        <Portrait look={w.look} scale={2} />
        <span className="min-w-0">
          <span className="block text-sm text-ink2">
            {w.role} · <span style={{ color: mood.color }}>{mood.text}</span> · energy {Math.round(w.energy)}
          </span>
        </span>
        <Icon name="arrow" size={12} color={T.muted} className="ml-auto" />
      </button>

      <ul ref={listRef} className="scroll-thin flex max-h-[34vh] min-h-32 flex-col gap-2 overflow-y-auto py-3 md:max-h-[58vh]" data-testid="chat-thread">
        {thread.length === 0 && <li className="py-4 text-center text-sm text-ink2">Say hi to {w.name}. They remember what you tell them.</li>}
        {thread.map((m, i) => (
          <Bubble key={m.id} m={m} look={w.look} read={m.from === "player" && i < lastWorkerIdx} workerId={w.id} />
        ))}
        {pending && (
          <li className="flex items-end gap-2" data-testid="chat-typing" aria-label={`${w.name} is typing`}>
            <Portrait look={w.look} scale={1.5} />
            <span className="rounded-2xl rounded-bl-sm bg-raised px-3 py-2.5">
              <TypingDots />
            </span>
          </li>
        )}
      </ul>
      {!game.settings.ai && <p className="text-xs text-muted">AI replies are off in Settings.</p>}
    </Panel>
  );
}

function Bubble({ m, look, read, workerId }: { m: ChatMessage; look: Parameters<typeof Portrait>[0]["look"]; read: boolean; workerId: string }) {
  if (m.from === "system") {
    return (
      <li className="flex justify-center" data-testid="chat-system">
        <span className="rounded-chip border border-line bg-surface px-2.5 py-1 text-xs text-ink2">{m.text}</span>
      </li>
    );
  }
  const mine = m.from === "player";
  return (
    <li className={`animate-pop flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && (
        <span className="mt-1 shrink-0">
          <Portrait look={look} scale={1.5} />
        </span>
      )}
      <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
        <span className={`rounded-2xl px-3 py-2 text-md whitespace-pre-wrap ${mine ? "rounded-br-sm bg-cyan/20 text-ink" : "rounded-bl-sm bg-raised text-ink"}`} data-testid={mine ? "chat-player-msg" : "chat-worker-msg"}>
          {m.text}
        </span>
        <span className="mt-0.5 flex items-center gap-1 px-1 font-pixel text-xs text-muted">
          {clockOf(m.t)}
          {mine && <span style={{ color: read ? T.cyan : T.muted }}>{read ? "✓✓" : "✓"}</span>}
        </span>
        {m.request?.type === "raise" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-button border border-yellow/40 bg-yellow/10 px-3 py-2 text-sm">
            <span className="text-yellow">Raise request: +${m.request.amount}/day</span>
            {m.request.status === "open" ? (
              <>
                <Button size="sm" variant="primary" color={T.green} onClick={() => answerRaise(workerId, m.id, true)} testId="raise-approve">
                  Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => answerRaise(workerId, m.id, false)}>
                  Decline
                </Button>
              </>
            ) : (
              <span className="text-ink2">{m.request.status}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
