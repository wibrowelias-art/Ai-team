"use client";

import { useState } from "react";
import { useGame } from "@/game/store";
import type { Focus } from "@/game/types";
import { Section } from "../ui";

export const FOCUSES: Focus[] = ["shop", "freelance", "music", "social", "research", "ops", "wild"];

const chip = "rounded border px-2 py-1 font-pixel text-[15px] disabled:opacity-35";

/** Bonus, raise and task-budget buttons for one worker. */
export default function PayBox({ workerId, name, cash }: { workerId: string; name: string; cash: number }) {
  const payBonus = useGame((s) => s.payBonus);
  const giveRaise = useGame((s) => s.giveRaise);
  const fundTask = useGame((s) => s.fundTask);

  return (
    <Section title="Give money">
      <div className="flex flex-col gap-2" data-testid="pay-box">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 font-pixel text-[14px] text-white/50 uppercase">Bonus</span>
          {[50, 100, 200, 500].map((a) => (
            <button
              key={a}
              type="button"
              disabled={a > cash}
              onClick={() => payBonus(workerId, a)}
              className={`${chip} border-hud/50 text-hud hover:bg-hud/10`}
              data-testid={`bonus-${a}`}
              aria-label={`Pay ${name} a $${a} bonus`}
            >
              ${a}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 font-pixel text-[14px] text-white/50 uppercase">Raise</span>
          {[10, 25, 50].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => giveRaise(workerId, a)}
              className={`${chip} border-neon-green/50 text-neon-green hover:bg-neon-green/10`}
              data-testid={`raise-${a}`}
            >
              +${a}/d
            </button>
          ))}
          <button
            type="button"
            onClick={() => giveRaise(workerId, -25)}
            className={`${chip} border-danger/50 text-danger hover:bg-danger/10`}
            aria-label={`Cut ${name}'s pay by $25 a day`}
          >
            -$25/d
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 font-pixel text-[14px] text-white/50 uppercase">Task $</span>
          {[100, 200].map((a) => (
            <button
              key={a}
              type="button"
              disabled={a > cash}
              onClick={() => fundTask(workerId, a)}
              className={`${chip} border-cyan/50 text-cyan hover:bg-cyan/10`}
              title={`+${Math.round(Math.min(0.5, a / 400) * 100)}% output for 24h`}
            >
              ${a}
            </button>
          ))}
          <span className="text-[10px] text-white/40">boosts output 24h</span>
        </div>
      </div>
    </Section>
  );
}

/** Fire button with a confirm step. */
export function FireBox({ workerId, name, salary }: { workerId: string; name: string; salary: number }) {
  const fire = useGame((s) => s.fire);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-5 w-full rounded border border-danger/30 py-1.5 font-pixel text-[15px] text-danger/80 hover:bg-danger/10"
        data-testid="fire"
      >
        Fire {name}
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Fire ${name}?`} className="mt-5 rounded border border-danger/60 bg-danger/10 p-3" data-testid="fire-confirm">
      <p className="text-sm text-white">
        Fire {name}? Severance is ${salary}. The crew will not love it.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded border border-white/20 py-1.5 font-pixel text-[15px] text-white/80">
          Cancel
        </button>
        <button type="button" onClick={() => fire(workerId)} className="flex-1 rounded bg-danger py-1.5 font-pixel text-[15px] text-white" data-testid="fire-yes">
          Fire
        </button>
      </div>
    </div>
  );
}
