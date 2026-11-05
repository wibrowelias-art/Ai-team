import { beforeEach, describe, expect, it } from "vitest";
import { addPlayerMessage, answerRaise, applyChatReply, applyInitiated, briefOf, companyOf, finishMeeting, gatherMeeting } from "@/game/ai/apply";
import { chatPrompt, meetingPrompt } from "@/game/ai/prompts";
import { addMemory, detectOrder, extractMemory, recallFromMemory, scriptedChat, scriptedMeeting } from "@/game/ai/scripted";
import type { ChatRequest, MeetingRequest } from "@/game/ai/types";
import {
  breaksFiction,
  parseJsonLoose,
  sanitizeAction,
  sanitizeMeetingAction,
  validateChatResult,
  validateMeetingResult,
  validateRequest,
  workerResolver,
} from "@/game/ai/validate";
import { mulberry32, newGameState, step } from "@/game/sim";
import type { GameState } from "@/game/types";
import { RateLimiter } from "@/server/rateLimit";
import { generate, resetModelCooldowns } from "@/server/gemini";
import { handleChat } from "@/server/handleChat";

const rng = () => mulberry32(7);
const fresh = (): GameState => newGameState("Test Co", "pink", mulberry32(1));
const worker = (g: GameState, id: string) => g.workers.find((w) => w.id === id)!;

function chatReq(g: GameState, id: string, message: string): ChatRequest {
  const w = worker(g, id);
  return { kind: "chat", worker: briefOf(w), memories: w.memories, history: [], company: companyOf(g), message };
}

describe("validation of model output", () => {
  it("parses JSON with code fences and chatter", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(parseJsonLoose("nope")).toBeNull();
  });

  it("keeps only allowed actions", () => {
    expect(sanitizeAction({ type: "assignTask", task: "shop_designs" })).toEqual({ type: "assignTask", task: "shop_designs" });
    expect(sanitizeAction({ type: "assignTask", task: "hack_the_bank" })).toBeNull();
    expect(sanitizeAction({ type: "goTo", room: "war room" })).toEqual({ type: "goTo", room: "WAR_ROOM" });
    expect(sanitizeAction({ type: "goTo", room: "VAULT" })).toBeNull();
    expect(sanitizeAction({ type: "askRaise", amount: 99999 })).toEqual({ type: "askRaise", amount: 150 });
    expect(sanitizeAction({ type: "askRaise", amount: 1 })).toBeNull();
    expect(sanitizeAction({ type: "deleteSave" })).toBeNull();
    expect(sanitizeAction("assignTask")).toBeNull();
  });

  it("rejects replies that break the fiction", () => {
    expect(breaksFiction("As an AI, I cannot")).toBe(true);
    expect(breaksFiction("I'm an assistant")).toBe(true);
    expect(validateChatResult({ reply: "As an AI language model I love sales", action: null })).toBeNull();
    expect(validateChatResult({ reply: "ok boss", action: null, newMemory: null, moodDelta: 50 })!.moodDelta).toBe(10);
  });

  it("limits replies to three short messages", () => {
    const r = validateChatResult({ reply: "a\nb\nc\nd\ne", action: null })!;
    expect(r.reply.split("\n")).toHaveLength(3);
  });

  it("validates meetings: known speakers only, decisions sanitized", () => {
    const attendees = [
      { id: "matt", name: "Matt" },
      { id: "bunc", name: "Bunc" },
      { id: "luke", name: "Luke" },
    ];
    const raw = {
      lines: [
        { speaker: "Matt", text: "Agenda." },
        { speaker: "Bunc", text: "SHIRTS 🔥" },
        { speaker: "Stranger", text: "hi" },
        { speaker: "luke", text: "bet" },
        { speaker: "You", text: "player lines are not allowed" },
      ],
      decisions: [
        { summary: "Luke on shop", action: { type: "assignTask", worker: "Luke", task: "shop_designs" } },
        { summary: "Bad", action: { type: "assignTask", worker: "Ghost", task: "shop_designs" } },
        { summary: "Budget", action: { type: "setBudget", business: "shop", amount: 9999 } },
      ],
    };
    const m = validateMeetingResult(raw, attendees, ["shirts5"])!;
    expect(m.lines.map((l) => l.speaker)).toEqual(["Matt", "Bunc", "Luke"]);
    expect(m.decisions[0].action).toEqual({ type: "assignTask", worker: "luke", task: "shop_designs" });
    expect(m.decisions[1].action).toBeNull();
    expect(m.decisions[2].action).toEqual({ type: "setBudget", business: "shop", amount: 500 });
    expect(sanitizeMeetingAction({ type: "assignMission", worker: "matt", mission: "nope" }, workerResolver(attendees), ["shirts5"])).toBeNull();
  });
});

describe("validation of client payloads", () => {
  it("accepts a well-formed chat request and trims oversized fields", () => {
    const g = fresh();
    const req = { ...chatReq(g, "dennis", "x".repeat(2000)), history: Array.from({ length: 50 }, () => ({ from: "player", text: "hi" })) };
    const v = validateRequest(req);
    expect(typeof v).not.toBe("string");
    if (typeof v === "string" || v.kind !== "chat") throw new Error("bad");
    expect(v.message.length).toBe(500);
    expect(v.history.length).toBe(20);
  });

  it("rejects junk", () => {
    expect(validateRequest(null)).toMatch(/object/);
    expect(validateRequest({ kind: "chat" })).toMatch(/worker/);
    expect(validateRequest({ kind: "meeting", topic: "x", attendees: [] })).toMatch(/2 attendees/);
    expect(validateRequest({ kind: "launchMissiles" })).toMatch(/Unknown/);
  });
});

describe("prompts", () => {
  it("includes persona, state, memories, rules and the JSON shape", () => {
    const g = fresh();
    const w = worker(g, "dennis");
    w.memories = ["Boss's favorite color is green"];
    const p = chatPrompt({ ...chatReq(g, "dennis", "what's my favorite color?"), memories: w.memories });
    expect(p.system).toContain("You are Dennis");
    expect(p.system).toContain("favorite color is green");
    expect(p.system).toMatch(/Never say you are an AI/);
    expect(p.system).toContain('"reply"');
    expect(p.contents[p.contents.length - 1].parts[0].text).toContain("favorite color");
  });

  it("keeps roles alternating for Gemini", () => {
    const g = fresh();
    const req: ChatRequest = {
      ...chatReq(g, "bunc", "hi"),
      history: [
        { from: "worker", text: "a" },
        { from: "worker", text: "b" },
        { from: "player", text: "c" },
        { from: "player", text: "d" },
      ],
    };
    const roles = chatPrompt(req).contents.map((c) => c.role);
    expect(roles[0]).toBe("user");
    for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
  });

  it("meeting prompts list attendees and allowed decisions", () => {
    const g = fresh();
    const req: MeetingRequest = {
      kind: "meeting",
      topic: "next product",
      attendees: g.workers.slice(0, 3).map(briefOf),
      company: companyOf(g),
      missions: [{ id: "shirts5", title: "Launch 5 new shirt designs" }],
      transcript: [],
      playerLine: null,
    };
    const p = meetingPrompt(req);
    expect(p.system).toContain("Matt");
    expect(p.system).toContain("setBudget");
    expect(p.system).toContain("shirts5");
  });
});

describe("scripted fallback", () => {
  it("extracts and recalls memories", () => {
    expect(extractMemory("my favorite color is green")).toBe("Boss's favorite color is green");
    expect(extractMemory("My name is Sam.")).toBe("Boss's name is Sam");
    expect(extractMemory("what's my favorite color?")).toBeNull();
    expect(recallFromMemory("what's my favorite color?", ["Boss's favorite color is green"])).toBe("green");
    expect(recallFromMemory("what's my favorite color?", [])).toBeNull();
  });

  it("replaces an old memory about the same thing", () => {
    const m = addMemory(["Boss's favorite color is green"], "Boss's favorite color is blue");
    expect(m).toEqual(["Boss's favorite color is blue"]);
    expect(addMemory(Array.from({ length: 30 }, (_, i) => `fact ${i}`), "new").length).toBe(30);
  });

  it("detects orders", () => {
    expect(detectOrder("go work on the shop")).toEqual({ type: "assignTask", task: "shop_designs" });
    expect(detectOrder("Luke, focus on social content")).toEqual({ type: "assignTask", task: "social_content" });
    expect(detectOrder("take a break")).toEqual({ type: "takeBreak" });
    expect(detectOrder("go to the war room")).toEqual({ type: "goTo", room: "WAR_ROOM" });
    expect(detectOrder("how is the shop doing?")).toBeNull();
  });

  it("answers in voice, remembers and follows orders", () => {
    const g = fresh();
    const dennis = briefOf(worker(g, "dennis"));
    const told = scriptedChat(dennis, [], "my favorite color is green", rng());
    expect(told.newMemory).toBe("Boss's favorite color is green");
    const asked = scriptedChat(dennis, [told.newMemory!], "what's my favorite color?", rng());
    expect(asked.reply.toLowerCase()).toContain("green");
    const order = scriptedChat(briefOf(worker(g, "luke")), [], "go work on the shop", rng());
    expect(order.action).toEqual({ type: "assignTask", task: "shop_designs" });
  });

  it("scripted meetings have 3+ speakers and an actionable decision", () => {
    const g = fresh();
    const m = scriptedMeeting("next product", g.workers.slice(0, 5).map(briefOf), rng());
    expect(new Set(m.lines.map((l) => l.speaker)).size).toBeGreaterThanOrEqual(3);
    expect(m.lines.length).toBeGreaterThanOrEqual(6);
    expect(m.decisions.some((d) => d.action)).toBe(true);
  });
});

describe("applying results to the game", () => {
  it("'go work on the shop' moves Luke to the Factory", () => {
    const g = addPlayerMessage(fresh(), "luke", "go work on the shop");
    const out = applyChatReply(g, "luke", { reply: "say less", action: { type: "assignTask", task: "shop_designs" }, newMemory: null, moodDelta: 0 }, "ai");
    const luke = worker(out.state, "luke");
    expect(luke.focus).toBe("shop");
    expect(luke.task).toBe("Designing shop products");
    expect(luke.target?.roomId).toBe("factory");
    expect(luke.activity).toBe("walking");
    // and he actually gets there
    const later = step(out.state, 30, mulberry32(3));
    const arrived = worker(later, "luke");
    expect(arrived.floor).toBe(2);
  });

  it("stores memories, splits replies and clamps mood", () => {
    const out = applyChatReply(fresh(), "dennis", { reply: "noted!\ngreen is 34% of my spreadsheets", action: null, newMemory: "Boss's favorite color is green", moodDelta: 99 }, "ai");
    const d = worker(out.state, "dennis");
    expect(d.memories).toContain("Boss's favorite color is green");
    expect(out.state.chats.dennis.filter((m) => m.from === "worker")).toHaveLength(2);
    expect(d.mood).toBe(Math.min(100, worker(fresh(), "dennis").mood + 10));
  });

  it("refuses to quit loyal workers and goTo locked rooms", () => {
    const g = fresh();
    const quit = applyChatReply(g, "matt", { reply: "bye", action: { type: "quit" }, newMemory: null, moodDelta: 0 }, "ai");
    expect(quit.state.workers.some((w) => w.id === "matt")).toBe(true);
    const locked = { ...g, building: { ...g.building, rooms: g.building.rooms.map((r) => (r.type === "SERVER_ROOM" ? { ...r, locked: true } : r)) } };
    const go = applyChatReply(locked, "matt", { reply: "on my way", action: { type: "goTo", room: "SERVER_ROOM" }, newMemory: null, moodDelta: 0 }, "ai");
    expect(go.note).toMatch(/isn't built/);
  });

  it("raise requests wait for the boss", () => {
    const g = applyInitiated(fresh(), "finn", "can we talk about pay?", { type: "askRaise", amount: 30 }, "script");
    const msg = g.chats.finn.find((m) => m.request)!;
    expect(msg.request).toEqual({ type: "raise", amount: 30, status: "open" });
    expect(worker(g, "finn").salary).toBe(160);
    const yes = answerRaise(g, "finn", msg.id, true);
    expect(worker(yes.state, "finn").salary).toBe(190);
    expect(answerRaise(yes.state, "finn", msg.id, true).error).not.toBeNull();
    const no = answerRaise(g, "finn", msg.id, false);
    expect(worker(no.state, "finn").salary).toBe(160);
    expect(worker(no.state, "finn").mood).toBeLessThan(worker(g, "finn").mood);
  });

  it("initiated texts respect the cooldown timestamp", () => {
    const g = applyInitiated(fresh(), "pham", "yo", null, "script");
    expect(worker(g, "pham").lastTextAt).toBe(g.minutes);
  });

  it("a meeting gathers people, applies decisions and sends them back", () => {
    const g0 = fresh();
    const ids = ["matt", "bunc", "luke"];
    const gathered = gatherMeeting(g0, ids, rng()).state;
    for (const id of ids) expect(worker(gathered, id).target?.roomId).toBe("war_room");
    const { state, outcomes } = finishMeeting(
      gathered,
      {
        topic: "next product",
        attendees: ids,
        lines: [{ speaker: "Matt", text: "go" }],
        decisions: [
          { summary: "Luke helps the shop", action: { type: "assignTask", worker: "luke", task: "shop_designs" } },
          { summary: "Shop budget up", action: { type: "setBudget", business: "shop", amount: 150 } },
          { summary: "Vibes", action: null },
        ],
      },
      rng(),
    );
    expect(outcomes.filter((o) => o.applied)).toHaveLength(2);
    expect(worker(state, "luke").focus).toBe("shop");
    expect(state.economy.budgets.shop).toBe(150);
    expect(state.meetings).toHaveLength(1);
    expect(state.workers.every((w) => w.target?.purpose !== "meeting")).toBe(true);
  });
});

describe("server", () => {
  beforeEach(() => resetModelCooldowns());

  const okBody = (json: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });

  it("falls back to the second model when the first fails", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes("gemini-flash-latest:")) return new Response("busy", { status: 503 });
      return okBody({ reply: "hey boss", action: null, newMemory: null, moodDelta: 0 });
    }) as unknown as typeof fetch;
    const g = fresh();
    const r = await generate(chatPrompt(chatReq(g, "bunc", "hi")), validateChatResult, { apiKey: "k", fetchImpl });
    expect(r.model).toBe("gemini-flash-lite-latest");
    expect(calls).toHaveLength(2);
  });

  it("skips an overloaded primary for a while", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes("gemini-flash-latest:")) return new Response("slow down", { status: 429 });
      return okBody({ reply: "yo", action: null, newMemory: null, moodDelta: 0 });
    }) as unknown as typeof fetch;
    const prompt = chatPrompt(chatReq(fresh(), "luke", "hi"));
    await generate(prompt, validateChatResult, { apiKey: "k", fetchImpl });
    await generate(prompt, validateChatResult, { apiKey: "k", fetchImpl });
    expect(calls.filter((u) => u.includes("gemini-flash-latest:"))).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("treats invalid output as a failure", async () => {
    const fetchImpl = (async () => okBody({ reply: "As an AI I can't" })) as unknown as typeof fetch;
    await expect(generate(chatPrompt(chatReq(fresh(), "bunc", "hi")), validateChatResult, { apiKey: "k", fetchImpl })).rejects.toThrow();
  });

  it("gives up within the time budget (both models hang)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        calls.push(url);
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const start = Date.now();
    // Same logic as the real 6 s / 12 s budget, scaled down 20x.
    await expect(
      generate(chatPrompt(chatReq(fresh(), "bunc", "hi")), validateChatResult, { apiKey: "k", fetchImpl, totalMs: 600, primaryMs: 300 }),
    ).rejects.toThrow(/timed out/);
    const took = Date.now() - start;
    expect(took).toBeGreaterThanOrEqual(550);
    expect(took).toBeLessThan(900);
    expect(calls).toHaveLength(2);
  });

  it("route: no key → scripted mode, bad body → 400, rate limit → 429, success → 200", async () => {
    const g = fresh();
    const body = JSON.stringify(chatReq(g, "dennis", "hi"));
    const mk = (b = body) => new Request("http://x/api/chat", { method: "POST", body: b, headers: { "x-forwarded-for": "1.2.3.4" } });

    const noKey = await handleChat(mk(), { apiKey: "" });
    expect(await noKey.json()).toEqual({ ok: false, reason: "ai-disabled" });

    const limiter = new RateLimiter(2, 60_000);
    const fetchImpl = (async () => okBody({ reply: "hi boss", action: { type: "nuke" }, newMemory: null, moodDelta: 2 })) as unknown as typeof fetch;
    const bad = await handleChat(mk("{not json"), { apiKey: "k", limiter, fetchImpl });
    expect(bad.status).toBe(400);
    const good = await handleChat(mk(), { apiKey: "k", limiter, fetchImpl });
    expect(good.status).toBe(200);
    const data = await good.json();
    expect(data.ok).toBe(true);
    expect(data.data.action).toBeNull(); // unknown action stripped
    const limited = await handleChat(mk(), { apiKey: "k", limiter, fetchImpl });
    expect(limited.status).toBe(429);
  });

  it("rate limiter frees slots after the window", () => {
    const l = new RateLimiter(2, 1000);
    expect(l.hit("a", 0).allowed).toBe(true);
    expect(l.hit("a", 10).allowed).toBe(true);
    expect(l.hit("a", 20).allowed).toBe(false);
    expect(l.hit("b", 20).allowed).toBe(true);
    expect(l.hit("a", 1001).allowed).toBe(true);
  });
});
