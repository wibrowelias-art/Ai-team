"use client";

import { useState } from "react";
import { useGame } from "@/game/store";
import type { Focus } from "@/game/types";
import { T } from "@/ui/tokens";
import { Button, Section } from "../ui";

export const FOCUSES: Focus[] = ["shop", "freelance", "music", "social", "research", "ops", "wild"];

/** Bonus, raise and task-budget buttons for one worker. Disabled buttons say why. */
export default function PayBox({ workerId, name, cash }: { workerId: string; name: string; cash: number }) {
  const payBonus = useGame((s) => s.payBonus);
  const giveRaise = useGame((s) => s.giveRaise);
  const fundTask = useGame((s) => s.fundTask);
  const short = (a: number) => (a > cash ? `Not enough cash (need $${a.toLocaleString("en-US")})` : undefined);

  return (
    <Section title="Give money">
      <div className="flex flex-col gap-3" data-testid="pay-box">
        <div>
          <div className="mb-1.5 text-xs text-ink2">One-time bonus · mood and loyalty up</div>
          <div className="grid grid-cols-4 gap-2">
            {[50, 100, 200, 500].map((a) => (
              <Button key={a} color={T.yellow} disabled={a > cash} title={short(a)} onClick={() => payBonus(workerId, a)} testId={`bonus-${a}`} full>
                ${a}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs text-ink2">Daily salary</div>
          <div className="grid grid-cols-4 gap-2">
            {[10, 25, 50].map((a) => (
              <Button key={a} color={T.green} onClick={() => giveRaise(workerId, a)} testId={`raise-${a}`} full>
                +${a}
              </Button>
            ))}
            <Button variant="danger" onClick={() => giveRaise(workerId, -25)} title={`Cut ${name}'s pay by $25 a day`} full>
              −$25
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs text-ink2">Task budget · +25% / +50% output for 24h</div>
          <div className="grid grid-cols-2 gap-2">
            {[100, 200].map((a) => (
              <Button key={a} color={T.cyan} disabled={a > cash} title={short(a)} onClick={() => fundTask(workerId, a)} full>
                ${a}
              </Button>
            ))}
          </div>
        </div>
        {cash < 50 && <p className="text-xs text-red">Cash is too low for a bonus right now.</p>}
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
      <div className="mt-6">
        <Button variant="danger" icon="fire" onClick={() => setConfirming(true)} testId="fire" full>
          Fire {name}
        </Button>
      </div>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Fire ${name}?`} className="mt-6 rounded-panel border border-red/60 bg-red/10 p-4" data-testid="fire-confirm">
      <p className="text-md text-ink">
        Fire {name}? Severance is ${salary.toLocaleString("en-US")}. The crew will not love it.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="soft" onClick={() => setConfirming(false)} full>
          Cancel
        </Button>
        <Button variant="primary" color={T.red} onClick={() => fire(workerId)} testId="fire-yes" full>
          Fire
        </Button>
      </div>
    </div>
  );
}
