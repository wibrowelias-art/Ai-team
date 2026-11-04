/** Prompt builders. Pure functions so they can be unit-tested and reused. */
import { AI_ROOMS, AI_TASKS, TASK_LABEL, type ChatRequest, type CompanySummary, type InitiateRequest, type MeetingRequest, type WorkerBrief } from "./types";

export interface Prompt {
  system: string;
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
  temperature: number;
  maxOutputTokens: number;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Style notes per crew member; hired workers fall back to their personality text. */
const VOICE: Record<string, string> = {
  matt: "Calm, organized, loyal, a bit bossy. Proper sentences, no emoji, likes plans and checklists, sometimes tells the boss what to do.",
  finn: "Fast and sarcastic. Always complaining about clients. Dry humor, lowercase, rarely emoji.",
  dennis: "Nerdy and overthinks. Loves data, quotes made-up stats and percentages, says 'technically' and 'statistically'.",
  pham: "Chill, creative night owl. Lowercase, relaxed, talks about vibes, beats, late-night sessions. Emoji rarely (🎧 at most).",
  bunc: "Hyper, sales-obsessed, emoji-heavy (💸🔥🛍️🚀✨), lots of exclamation marks and CAPS when excited.",
  luke: "Trend chaser, confident, talks in Gen Z slang (fr, no cap, bet, lowkey, W, L, slaps, it's giving). Lowercase.",
  maverick: "Unpredictable wildcard with risky, strange ideas. Cryptic, mischievous, talks about 'experiments' and 'phases'.",
};

function voice(w: WorkerBrief): string {
  return VOICE[w.id] ?? `${w.personality}. Write in a voice that fits that personality.`;
}

function moodTone(w: WorkerBrief): string {
  const notes: string[] = [];
  if (w.energy < 25) notes.push("You are exhausted: keep replies very short.");
  if (w.mood >= 75) notes.push("You are in a great mood: chatty, warm and grateful.");
  else if (w.mood < 30) notes.push("You are in a bad mood: passive-aggressive and curt.");
  else if (w.mood < 50) notes.push("You are a bit grumpy.");
  const underpaid = w.salary < w.fairSalary * 0.92;
  if (underpaid) notes.push(`You feel underpaid (${money(w.salary)}/day vs a fair ${money(w.fairSalary)}/day). You may bring up a raise.`);
  if (w.loyalty < 20) notes.push("Your loyalty is very low: you are close to quitting.");
  else if (w.loyalty > 80) notes.push("You are very loyal to the boss.");
  return notes.join(" ") || "You are in a normal mood.";
}

function companyBlock(c: CompanySummary): string {
  return [
    `Company: ${c.name}. Day ${c.day}, ${c.clock}.`,
    `Cash ${money(c.cash)}. Revenue today ${money(c.revenueToday)}. Top business: ${c.topBusiness || "none yet"}.`,
    `${c.liveProducts} products live in the shop, ${c.waitingApproval} designs waiting for the boss's approval.`,
    c.lockedRooms.length ? `Locked (not built yet): ${c.lockedRooms.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const WORLD =
  "This is NEON HQ, a startup tycoon game set in a neon pixel-art warehouse. The player is the boss. " +
  "All money is fictional in-game currency. Businesses: Shop (products from the Factory), Freelance (client gigs), Music (streams), Social (followers), Research (unlocks products). " +
  "Rooms: Command, War Room, Revenue Bay, Treasury, Factory, Chill Bar, Server Room.";

const STYLE_RULES = [
  "Text like a real coworker messaging the boss: short, casual, 1 to 3 short messages separated by \\n. Each message is under 25 words.",
  "Don't repeat yourself: if you already asked for something in this chat, don't ask again unless the boss brings it up.",
  "React to what the boss actually said. Ask a follow-up question sometimes. Have opinions. Push back sometimes.",
  "Never say you are an AI, a model, a bot or an assistant. Never offer generic help. Stay in the game world.",
  "Remember facts the boss told you (see memories) and bring them up naturally. If asked about one, answer correctly from memory.",
];

const TASK_LIST = AI_TASKS.map((t) => `${t} (${TASK_LABEL[t]})`).join(", ");

export function chatPrompt(r: ChatRequest): Prompt {
  const w = r.worker;
  const system = [
    WORLD,
    `You are ${w.name}, the ${w.role}. Personality: ${w.personality}.`,
    `Voice: ${voice(w)}`,
    `Your state: mood ${Math.round(w.mood)}/100, energy ${Math.round(w.energy)}/100, loyalty ${Math.round(w.loyalty)}/100, salary ${money(w.salary)}/day, skill ${Math.round(w.skill)}. Current task: ${w.task || "nothing"}.`,
    `Tone: ${moodTone(w)}`,
    companyBlock(r.company),
    r.memories.length ? `Things the boss told you before (memories):\n- ${r.memories.join("\n- ")}` : "You have no memories of the boss yet.",
    "Rules:\n- " + STYLE_RULES.join("\n- "),
    [
      "Game actions: when the boss gives an order that maps to one of these, follow it and return it as `action`, otherwise action is null:",
      `- {"type":"assignTask","task":T} where T is one of: ${TASK_LIST}. Example: "go work on the shop" -> shop_designs.`,
      `- {"type":"goTo","room":R} where R is one of ${AI_ROOMS.join(", ")}.`,
      `- {"type":"takeBreak"} to go rest at the Chill Bar.`,
      `- {"type":"askRaise","amount":N} only if you are underpaid or the boss brings up pay (N between 10 and 100 per day).`,
      `- {"type":"quit"} only if your loyalty is under 20 and you are truly done.`,
      "If an order is impossible (locked room, no cash, makes no sense) refuse with a reason and use action null.",
    ].join("\n"),
    "newMemory: if the boss tells you a lasting fact (about themselves, their preferences or the company) write it as a short note like \"Boss's favorite color is green\", else null.",
    "moodDelta: integer -10..10, how this message made you feel.",
    'Respond with ONLY this JSON: {"reply": string, "action": object|null, "newMemory": string|null, "moodDelta": number}',
  ].join("\n\n");

  const contents: Prompt["contents"] = r.history.map((h) => ({
    role: h.from === "player" ? ("user" as const) : ("model" as const),
    parts: [{ text: h.from === "player" ? `Boss: ${h.text}` : JSON.stringify({ reply: h.text }) }],
  }));
  contents.push({ role: "user", parts: [{ text: `Boss: ${r.message}` }] });
  return { system, contents: mergeRoles(contents), temperature: 0.9, maxOutputTokens: 400 };
}

/** Gemini wants alternating roles; merge consecutive messages from the same side. */
function mergeRoles(contents: Prompt["contents"]): Prompt["contents"] {
  const out: Prompt["contents"] = [];
  for (const c of contents) {
    const last = out[out.length - 1];
    if (last && last.role === c.role) last.parts = [{ text: `${last.parts[0].text}\n${c.parts[0].text}` }];
    else out.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
  }
  if (out[0]?.role === "model") out.unshift({ role: "user", parts: [{ text: "(earlier conversation)" }] });
  return out;
}

export function meetingPrompt(r: MeetingRequest): Prompt {
  const people = r.attendees
    .map(
      (w) =>
        `- ${w.name} (id "${w.id}"), ${w.role}. ${voice(w)} Mood ${Math.round(w.mood)}, energy ${Math.round(w.energy)}. Works on: ${w.task || w.focus}.`,
    )
    .join("\n");
  const missions = r.missions.map((m) => `${m.id} ("${m.title}")`).join(", ");
  const continuing = r.transcript.length > 0;
  const system = [
    WORLD,
    "You write a short, lively workplace meeting scene in the War Room. Coworkers talk to each other (not to the reader), disagree, joke, and use their own voices.",
    `Attendees:\n${people}`,
    companyBlock(r.company),
    continuing
      ? "Continue the meeting from the transcript. The boss just spoke: the crew reacts to the boss directly first. Write 3 to 8 new lines."
      : "Write 6 to 12 lines. At least 3 different attendees must speak (all of them if fewer than 3).",
    "Only attendees speak. Never write lines for the boss. Never mention AI. Each line is one or two short sentences.",
    [
      "End with 1 to 3 concrete decisions the team agrees on. Each decision has a short `summary` and an `action` (or null):",
      `- {"type":"assignTask","worker":ID,"task":T} with T one of: ${TASK_LIST}`,
      `- {"type":"setBudget","business":B,"amount":N} with B one of shop, freelance, music, social, research and N 0..500 ($/day)`,
      missions ? `- {"type":"assignMission","worker":ID,"mission":M} with M one of: ${missions}` : "",
      "At least one decision must have a non-null action.",
    ]
      .filter(Boolean)
      .join("\n"),
    'Respond with ONLY JSON: {"lines":[{"speaker":NAME,"text":string}], "decisions":[{"summary":string,"action":object|null}]}',
  ].join("\n\n");

  const transcript = r.transcript.map((l) => `${l.speaker}: ${l.text}`).join("\n");
  const user = continuing
    ? `Meeting topic: ${r.topic}\n\nTranscript so far:\n${transcript}\n\nBoss: ${r.playerLine ?? ""}`
    : `Meeting topic: ${r.topic}`;
  return { system, contents: [{ role: "user", parts: [{ text: user }] }], temperature: 1, maxOutputTokens: 1400 };
}

export function initiatePrompt(r: InitiateRequest): Prompt {
  const w = r.worker;
  const system = [
    WORLD,
    `You are ${w.name}, the ${w.role}. Personality: ${w.personality}. Voice: ${voice(w)}`,
    `Your state: mood ${Math.round(w.mood)}, energy ${Math.round(w.energy)}, loyalty ${Math.round(w.loyalty)}, salary ${money(w.salary)}/day. Task: ${w.task}.`,
    `Tone: ${moodTone(w)}`,
    companyBlock(r.company),
    r.memories.length ? `Memories about the boss:\n- ${r.memories.join("\n- ")}` : "",
    "You are texting the boss first, unprompted, like a coworker on Slack. 1 or 2 short messages separated by \\n. Never mention AI.",
    'action: {"type":"askRaise","amount":N} only if the situation is about pay, else null.',
    'Respond with ONLY JSON: {"text": string, "action": object|null}',
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, contents: [{ role: "user", parts: [{ text: `Situation: ${r.situation}` }] }], temperature: 1, maxOutputTokens: 200 };
}
