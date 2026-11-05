/**
 * Balance check: plays 30 game days three ways and prints cash per day.
 * Run with: npm run balance
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import * as A from "@/game/actions";
import { addFloor, buildRoom, buyUpgrade, upgradeRoom } from "@/game/build";
import { ensureCandidates, hire } from "@/game/hiring";
import { mulberry32, newGameState, step } from "@/game/sim";
import type { GameState } from "@/game/types";

type Style = "sensible" | "passive" | "reckless";

function act(g: GameState, day: number, style: Style, rng: () => number): GameState {
  if (style === "passive") return g;
  for (const p of g.products.filter((x) => x.stage === "approval")) g = A.approveProduct(g, p.id, rng).state;
  for (const ev of g.pendingEvents) {
    const sensible = ev.kind === "investor" ? 1 : ev.kind === "poaching" ? 2 : ev.kind === "outage" ? (g.cash > 2000 ? 0 : 1) : 0;
    const reckless = ev.kind === "investor" ? 0 : ev.kind === "refund" ? 1 : ev.kind === "poaching" ? 1 : ev.kind === "drama" ? 2 : 1;
    const r = A.resolveEvent(g, ev.id, style === "sensible" ? sensible : reckless, rng);
    if (!r.error) g = r.state;
  }
  if (style === "sensible") {
    if (day === 1) g = A.payBonus(g, "bunc", 100, rng).state;
    if (day >= 3 && g.cash > 4000 && g.workers.length < 11) {
      g = ensureCandidates(g, rng);
      const c = g.candidates.find((x) => x.salary <= 200);
      if (c) g = hire(g, c.id, rng).state;
    }
    if (day >= 4 && g.cash > 5000) {
      const slot = g.building.rooms.find((r) => r.type === "EMPTY");
      if (slot) g = buildRoom(g, slot.id, (["MERCH_STORE", "CAFE", "GYM", "OFFICE"] as const)[day % 4]).state;
    }
    if (day >= 5 && g.cash > 4000) g = buyUpgrade(g, "pcs").state;
    if (day >= 6 && g.cash > 3000) g = upgradeRoom(g, "factory").state;
    if (day >= 8 && g.cash > 15000) g = addFloor(g).state;
  } else {
    // reckless: huge bonuses, pay cuts, hire everyone, build everything on credit
    for (const w of g.workers) if (g.cash > 500) g = A.payBonus(g, w.id, 500, rng).state;
    for (const w of g.workers) g = A.giveRaise(g, w.id, -25, rng).state;
    g = ensureCandidates(g, rng);
    for (const c of g.candidates) g = hire(g, c.id, rng).state;
    g = addFloor(g).state;
  }
  return g;
}

it("prints a 30-day balance table", () => {
  const out: string[] = [];
  for (const style of ["sensible", "passive", "reckless"] as Style[]) {
    let g = newGameState("Balance", "pink", mulberry32(7));
    const rng = mulberry32(11);
    const cash: number[] = [g.cash];
    let bankruptDay = 0;
    for (let day = 1; day <= 30; day++) {
      g = act(g, day, style, rng);
      g = step(g, 24 * 60, rng);
      cash.push(Math.round(g.cash));
      if (g.cash < 0 && !bankruptDay) bankruptDay = day;
    }
    let flat = 0;
    let worstFlat = 0;
    for (let d = 1; d < cash.length; d++) {
      const change = Math.abs(cash[d] - cash[d - 1]) / Math.max(1000, Math.abs(cash[d - 1]));
      flat = change < 0.03 ? flat + 1 : 0;
      worstFlat = Math.max(worstFlat, flat);
    }
    out.push(`${style.padEnd(9)} end $${cash[30].toLocaleString()} workers ${g.workers.length} floors ${g.building.floors} longest flat run ${worstFlat}d ${bankruptDay ? `BANKRUPT day ${bankruptDay}` : ""}`);
    out.push("  " + cash.map((c, i) => (i % 3 === 0 ? `d${i}:${(c / 1000).toFixed(1)}k` : "")).filter(Boolean).join(" "));
    const h = g.economy.history[g.economy.history.length - 1];
    const b = Object.entries(h.byBusiness).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ");
    out.push(`  day30 revenue ${Math.round(h.revenue)} (${b}) spent ${Math.round(h.spent)} | fans ${Math.round(g.economy.businesses.music.fans)} fol ${Math.round(g.economy.businesses.social.followers)} eff +${Math.round(g.economy.businesses.research.efficiency * 100)}% live ${g.products.filter((p) => p.stage === "done").length}`);
  }
  // vitest swallows console output: write the table next to the project.
  writeFileSync("balance-report.txt", out.join("\n") + "\n");
});
