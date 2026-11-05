import { describe, expect, it } from "vitest";
import { barGossip, morningText, reactToEvent } from "@/game/chatter";
import { MINUTES_PER_DAY, START_MINUTE } from "@/game/constants";
import { draftOf, newLedger } from "@/game/draft";
import { resolveEvent, triggerEvent } from "@/game/events";
import { bookMilestones, MILESTONES, withMilestones } from "@/game/milestones";
import { deserialize, serialize } from "@/game/save";
import { mulberry32, newGameState, step } from "@/game/sim";
import type { GameState } from "@/game/types";

const rng = () => mulberry32(7);
const fresh = (seed = 1): GameState => newGameState("Feel Co", "cyan", mulberry32(seed));
const chatCount = (s: GameState) => Object.values(s.chats).flat().filter((m) => m.from === "worker").length;

describe("milestones", () => {
  it("start empty and book the first $1,000 with its reward and a log line", () => {
    const g = fresh();
    expect(g.milestones.done).toEqual([]);
    const d = draftOf(g);
    d.totalRevenue = 1200;
    const cash = d.cash;
    const reached = bookMilestones(d);
    expect(reached.map((m) => m.id)).toEqual(["rev_1k"]);
    expect(d.milestones.done).toEqual(["rev_1k"]);
    expect(d.milestones.unseen).toEqual(["rev_1k"]);
    expect(d.cash).toBe(cash + 200);
    expect(d.log.at(-1)?.text).toContain("Milestone: First $1,000");
    // Booked once only.
    expect(bookMilestones(d)).toEqual([]);
  });

  it("withMilestones returns the same state when nothing new was reached", () => {
    const g = fresh();
    expect(withMilestones(g)).toBe(g);
    const next = withMilestones({ ...g, meetings: [{ id: "x", topic: "t", t: 0, attendees: [], lines: [], decisions: [] }] });
    expect(next.milestones.done).toContain("meet_1");
  });

  it("every milestone reports progress in 0..∞ and the viral one counts hits", () => {
    const g = fresh();
    for (const m of MILESTONES) expect(m.progress(g)).toBeGreaterThanOrEqual(0);
    const d = draftOf(g);
    d.products = d.products.map((p) => ({ ...p, stage: "done" as const }));
    const ev = triggerEvent(d, "viral", rng());
    expect(ev).not.toBeNull();
    expect(d.milestones.virals).toBe(1);
    expect(MILESTONES.find((m) => m.id === "viral_1")!.progress(d)).toBe(1);
  });

  it("are celebrated during the simulation and survive a save", () => {
    const g = fresh();
    const d = draftOf(g);
    d.totalRevenue = 999;
    const after = step(d, 61, rng());
    expect(after.milestones.done).toContain("rev_1k");
    expect(chatCount(after)).toBeGreaterThan(chatCount(d));
    const loaded = deserialize(serialize(after))!;
    expect(loaded.milestones.done).toContain("rev_1k");
    expect(loaded.report).toBe(after.report);
  });

  it("migrates saves without milestones", () => {
    const g = fresh();
    const raw = JSON.parse(serialize(g));
    delete raw.milestones;
    delete raw.report;
    const loaded = deserialize(JSON.stringify(raw))!;
    expect(loaded.milestones).toEqual({ done: [], unseen: [], virals: 0 });
    expect(loaded.report).toBeNull();
  });
});

describe("daily report", () => {
  it("is queued when a day ends in the foreground, not while catching up offline", () => {
    const g = fresh();
    const toMidnight = MINUTES_PER_DAY - START_MINUTE + 1;
    const live = step(g, toMidnight, rng());
    expect(live.report).toBe(1);
    const offline = step(g, toMidnight, rng(), { offline: true });
    expect(offline.report).toBeNull();
  });
});

describe("worker chatter", () => {
  it("bystanders react to a resolved event with real names", () => {
    const d = draftOf(fresh());
    const ev = triggerEvent(d, "drama", rng())!;
    const before = chatCount(d);
    resolveEvent(d, ev.id, 0, () => 0.1);
    const lines = Object.values(d.chats).flat().map((m) => m.text);
    expect(chatCount(d)).toBeGreaterThan(before);
    const a = d.workers.find((w) => w.id === ev.data.a)!.name;
    expect(lines.some((t) => t.includes(a))).toBe(true);
    // The people in the argument do not comment on it.
    expect(d.chats[String(ev.data.a)] ?? []).toEqual([]);
  });

  it("reactToEvent respects the per-worker text cooldown", () => {
    const d = draftOf(fresh());
    for (const w of d.workers) w.lastTextAt = d.minutes;
    const ev = triggerEvent(d, "outage", rng())!;
    reactToEvent(d, ev, () => 0.1);
    expect(chatCount(d)).toBe(0);
  });

  it("someone texts yesterday's numbers in the morning", () => {
    const d = draftOf(fresh());
    const day = { ...newLedger(1), revenue: 1500, spent: 900 };
    day.byBusiness.shop = 1200;
    d.economy.history = [day];
    morningText(d, () => 0.5);
    const texts = Object.values(d.chats).flat().map((m) => m.text);
    expect(texts.some((t) => t.includes("$1,500") && t.toLowerCase().includes("shop"))).toBe(true);
  });

  it("gossips at the bar only when someone else is there", () => {
    const d = draftOf(fresh());
    const [a, b] = d.workers;
    a.activity = "resting";
    a.target = { roomId: "chill", spot: 0, purpose: "resting" };
    barGossip(d, a, () => 0.1);
    expect(chatCount(d)).toBe(0);
    b.activity = "resting";
    b.target = { roomId: "chill", spot: 1, purpose: "resting" };
    barGossip(d, a, () => 0.1);
    expect(chatCount(d)).toBe(1);
    expect(Object.values(d.chats).flat()[0].text).toContain(b.name);
    expect(a.bubble?.icon).toBe("talk");
  });
});
