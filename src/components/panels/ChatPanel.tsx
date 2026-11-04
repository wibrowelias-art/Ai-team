"use client";

import { useEffect, useRef, useState } from "react";
import { answerRaise, sendChat } from "@/game/aiStore";
import { floorBase } from "@/game/building";
import { useGame } from "@/game/store";
import Panel from "../Panel";
import Portrait from "../Portrait";
import { moodEmoji } from "../ui";
import { usePolledGame } from "../usePolled";

const SUGGESTIONS = ["how's it going?", "go work on the shop", "take a break", "great work today!"];

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

  const send = (msg: string) => {
    if (!msg.trim() || pending) return;
    void sendChat(workerId, msg);
    setText("");
  };

  return (
    <Panel title={`Chat · ${w.name}`} accent={w.look.outfit} onClose={onClose} testId="panel-chat">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => {
            openPanel({ id: "worker", ref: w.id });
            focusOn(w.x, floorBase(w.floor) - 8);
          }}
          className="flex items-center gap-2 text-left"
          aria-label={`Open ${w.name}'s profile`}
        >
          <Portrait look={w.look} scale={2} />
          <span>
            <span className="block font-pixel text-lg leading-none text-white">{w.name}</span>
            <span className="text-[11px] text-white/50">
              {w.role} · {moodEmoji(w.mood)} mood {Math.round(w.mood)} · ⚡{Math.round(w.energy)}
            </span>
          </span>
        </button>
      </div>

      <ul ref={listRef} className="scroll-thin flex max-h-[30vh] min-h-32 flex-col md:max-h-[60vh] gap-1.5 overflow-y-auto py-3" data-testid="chat-thread">
        {thread.length === 0 && <li className="text-center text-xs text-white/40">Say hi to {w.name}. They will remember what you tell them.</li>}
        {thread.map((m) => (
          <li key={m.id} className={`flex flex-col ${m.from === "player" ? "items-end" : "items-start"}`}>
            <span
              className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap ${
                m.from === "player" ? "rounded-br-sm bg-cyan/25 text-white" : "rounded-bl-sm bg-white/10 text-white"
              }`}
              data-testid={m.from === "worker" ? "chat-worker-msg" : "chat-player-msg"}
            >
              {m.text}
            </span>
            {m.request?.type === "raise" && (
              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-hud/40 bg-hud/10 px-2 py-1 text-xs">
                <span className="text-hud">Raise request: +${m.request.amount}/day</span>
                {m.request.status === "open" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => answerRaise(w.id, m.id, true)}
                      className="rounded bg-neon-green/20 px-2 py-0.5 text-neon-green"
                      data-testid="raise-approve"
                    >
                      Approve
                    </button>
                    <button type="button" onClick={() => answerRaise(w.id, m.id, false)} className="rounded bg-danger/15 px-2 py-0.5 text-danger">
                      Decline
                    </button>
                  </>
                ) : (
                  <span className="text-white/50">{m.request.status}</span>
                )}
              </div>
            )}
          </li>
        ))}
        {pending && (
          <li className="self-start rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2" data-testid="chat-typing" aria-label={`${w.name} is typing`}>
            <span className="inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          </li>
        )}
      </ul>

      <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            disabled={pending}
            className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:border-cyan/50 hover:text-white disabled:opacity-40"
          >
            {s}
          </button>
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
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan"
          data-testid="chat-input"
          enterKeyHint="send"
        />
        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="rounded-lg bg-cyan px-3 font-pixel text-lg text-ink disabled:opacity-40"
          data-testid="chat-send"
        >
          Send
        </button>
      </form>
      {!game.settings.ai && <p className="mt-2 text-[10px] text-white/40">AI replies are off in Settings: scripted replies only.</p>}
    </Panel>
  );
}
