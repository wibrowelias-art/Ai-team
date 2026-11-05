/** Workers talking about real things: event reactions, yesterday's numbers, gossip at the bar. */
import { BUSINESS_INFO } from "./business";
import { bubble, say } from "./draft";
import type { BusinessId, GameEvent, GameState, Worker } from "./types";

type Rng = () => number;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

/** Text the boss and remember when, so nobody spams. */
function text(s: GameState, w: Worker, line: string): void {
  w.lastTextAt = s.minutes;
  say(s, w.id, line);
}

const VOICE: Record<string, (t: string) => string> = {
  bunc: (t) => `${t} 🔥🔥`,
  luke: (t) => `${t} fr`,
  dennis: (t) => `${t} (I checked the numbers)`,
  maverick: (t) => `${t}. interesting.`,
  finn: (t) => `${t}. anyway, back to clients`,
  pham: (t) => `${t} 🎧`,
  matt: (t) => `${t}. I'll keep an eye on it`,
};

function voice(w: Worker, t: string): string {
  return (VOICE[w.id] ?? ((x: string) => x))(t);
}

const EVENT_LINES: Record<GameEvent["kind"], string[]> = {
  viral: ["did you SEE the numbers on {what}?? we're everywhere", "{what} is all over my feed, this is wild", "ok the whole office is screaming about {what}"],
  refund: ["those refunds stung. {n} clients, really?", "the refund wave has Finn in a mood, just so you know", "we should look at why clients keep asking for refunds"],
  investor: ["heard an investor came knocking. are we rich now?", "investor money or not, I'm still buying the cheap coffee", "so… did we take the VC deal?"],
  poaching: ["word is {who} got an offer from a rival. awkward", "a rival tried to poach {who}. everyone's whispering", "if {who} leaves I'm taking their desk, just saying"],
  outage: ["servers went dark again. nothing I can do until they're back", "outage. lost half an hour of work. cool.", "can we get better racks? the outage killed my flow"],
  drama: ["the shouting match between {a} and {b} was… a lot", "pretty sure the whole floor heard {a} and {b}", "{a} vs {b} round two. place your bets"],
};

/** One or two bystanders text about an event right after it is resolved. */
export function reactToEvent(s: GameState, ev: GameEvent, rng: Rng): void {
  const involved = new Set([String(ev.data.workerId ?? ""), String(ev.data.a ?? ""), String(ev.data.b ?? "")]);
  const who = (id: unknown) => s.workers.find((w) => w.id === id)?.name ?? "someone";
  const fill = (t: string) =>
    t
      .replace("{what}", s.economy.modifiers.find((m) => m.label.startsWith("Viral"))?.label.slice(7) ?? "the drop")
      .replace("{n}", String(3 + Math.floor(rng() * 5)))
      .replace("{who}", who(ev.data.workerId))
      .replace("{a}", who(ev.data.a))
      .replace("{b}", who(ev.data.b));
  const pool = s.workers.filter((w) => !involved.has(w.id) && s.minutes - w.lastTextAt > 90);
  const n = ev.kind === "viral" ? 2 : rng() < 0.6 ? 1 : 0;
  for (let i = 0; i < n && pool.length > 0; i++) {
    const w = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    text(s, w, voice(w, fill(pick(EVENT_LINES[ev.kind], rng))));
    if (ev.kind === "viral") bubble(w, "talk", s.minutes, 20);
  }
}

/** Everyone gets a word bubble and one person texts about a milestone. */
export function celebrate(s: GameState, title: string, rng: Rng): void {
  for (const w of s.workers) bubble(w, "talk", s.minutes, 15);
  const w = pick(s.workers, rng);
  if (!w) return;
  text(s, w, voice(w, pick([`${title}!! the whole crew is losing it`, `we just hit "${title}". drinks at the Chill Bar?`, `${title}. told you we'd get here`], rng)));
}

/** The morning after: one worker texts about yesterday's real numbers. */
export function morningText(s: GameState, rng: Rng): void {
  const day = s.economy.history[s.economy.history.length - 1];
  if (!day || s.workers.length === 0 || rng() < 0.25) return;
  const by = Object.entries(day.byBusiness) as [BusinessId, number][];
  const [bestId, best] = by.reduce((a, b) => (b[1] > a[1] ? b : a));
  const owner = s.workers.filter((w) => w.focus === bestId);
  const w = owner.length ? pick(owner, rng) : pick(s.workers, rng);
  const live = s.products.filter((p) => p.stage === "done" && p.sales > 0).sort((a, b) => b.sales - a.sales)[0];
  const prev = s.economy.history[s.economy.history.length - 2];
  const options = [`${money(day.revenue)} yesterday, ${money(best)} of it from ${BUSINESS_INFO[bestId].name.toLowerCase()}`];
  if (prev && day.revenue > prev.revenue * 1.2) options.push(`yesterday beat the day before by ${money(day.revenue - prev.revenue)}. we're getting good at this`);
  if (prev && day.revenue < prev.revenue * 0.7) options.push(`slow day yesterday: ${money(day.revenue)}. we need a push`);
  if (live) options.push(`${live.name} has sold ${live.sales.toLocaleString("en-US")} so far. people love it`);
  if (day.costs.salaries > day.revenue) options.push(`we spent more than we made yesterday (${money(day.spent)} out, ${money(day.revenue)} in). just flagging`);
  if (s.minutes - w.lastTextAt > 120) text(s, w, voice(w, pick(options, rng)));
}

const GOSSIP = {
  friend: ["sat with {o} at the bar. good people", "{o} and I are plotting something. you'll like it", "{o} says hi. we're taking five"],
  rival: ["{o} is at the bar too. we're… not talking", "grabbed a drink. {o} took the far stool. fine by me", "{o} keeps bringing up that argument. whatever"],
  neutral: ["bar break with {o}. the new drinks machine is great", "{o} told me a wild story at the bar, ask them", "quick break with {o}, back in ten"],
};

/** A worker who sits down at the Chill Bar next to someone sometimes texts about it. */
export function barGossip(s: GameState, w: Worker, rng: Rng): void {
  const others = s.workers.filter((o) => o.id !== w.id && o.activity === "resting" && o.target?.roomId === w.target?.roomId);
  if (others.length === 0 || rng() > 0.35 || s.minutes - w.lastTextAt < 180) return;
  const o = pick(others, rng);
  const rel = w.relationships[o.id] ?? 0;
  const pool = rel > 20 ? GOSSIP.friend : rel < -10 ? GOSSIP.rival : GOSSIP.neutral;
  bubble(w, "talk", s.minutes, 12);
  bubble(o, "talk", s.minutes, 12);
  text(s, w, voice(w, pick(pool, rng).replace("{o}", o.name)));
}
