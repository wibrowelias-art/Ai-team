/**
 * Scripted replies in each worker's voice. Used when AI replies are off, rate-limited,
 * or the model fails. Also extracts memories and simple orders without the model.
 */
import type { MeetingLine } from "../types";
import type { AiAction, AiTask, ChatResult, InitiateResult, MeetingDecision, MeetingResult, WorkerBrief } from "./types";
import { TASK_LABEL } from "./types";

type Rng = () => number;
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- memories

const MEMORY_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/\bmy (?:favou?rite) ([a-z ]{2,30}?) (?:is|are) ([^.!?,\n]{1,60})/i, (m) => `Boss's favorite ${m[1].trim()} is ${m[2].trim()}`],
  [/\bmy name is ([a-z][a-z' -]{1,30})/i, (m) => `Boss's name is ${m[1].trim()}`],
  [/\bmy (dog|cat|pet|kid|son|daughter|wife|husband|partner|girlfriend|boyfriend)(?:'s name)? is (?:called |named )?([a-z][a-z' -]{1,30})/i, (m) => `Boss's ${m[1]} is ${m[2].trim()}`],
  [/\bmy birthday is ([^.!?\n]{2,30})/i, (m) => `Boss's birthday is ${m[1].trim()}`],
  [/\bi(?:'m| am) allergic to ([^.!?,\n]{2,40})/i, (m) => `Boss is allergic to ${m[1].trim()}`],
  [/\bi (love|like|hate|can't stand) ([^.!?,\n]{2,50})/i, (m) => `Boss ${m[1] === "can't stand" ? "can't stand" : `${m[1]}s`} ${m[2].trim()}`],
  [/\bremember(?: that)? ([^\n]{4,140})/i, (m) => m[1].trim().replace(/[.!]+$/, "")],
];

/** Pull a memorable fact out of a message, if there is one. */
export function extractMemory(message: string): string | null {
  if (/\?\s*$/.test(message.trim())) return null;
  for (const [re, fmt] of MEMORY_PATTERNS) {
    const m = message.match(re);
    if (m) return fmt(m).slice(0, 200);
  }
  return null;
}

/** Add a memory, replacing an older one about the same thing. Max 30. */
export function addMemory(memories: string[], memory: string): string[] {
  const key = memory.toLowerCase().replace(/ (is|are) .*$/, "");
  const kept = memories.filter((m) => m.toLowerCase().replace(/ (is|are) .*$/, "") !== key && m.toLowerCase() !== memory.toLowerCase());
  return [...kept, memory].slice(-30);
}

/** Answer "what's my favorite color?"-style questions from memory. */
export function recallFromMemory(message: string, memories: string[]): string | null {
  if (!/\?|\bwhat|\bwho|\bwhen|\bremember|\bdo you know/i.test(message)) return null;
  const fav = message.match(/\bmy (?:favou?rite) ([a-z ]{2,30}?)(?:\?|$| is| again)/i);
  if (fav) {
    const thing = fav[1].trim().toLowerCase();
    const hit = memories.find((m) => m.toLowerCase().includes(`favorite ${thing} is`));
    return hit ? hit.replace(/^Boss's favorite [a-z ]+? is /i, "").trim() : null;
  }
  const name = /\bmy name\b/i.test(message) ? memories.find((m) => /^Boss's name is/i.test(m)) : null;
  if (name) return name.replace(/^Boss's name is /i, "");
  // Fall back to the memory sharing the most words with the question.
  const words = new Set(message.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  let best: string | null = null;
  let score = 0;
  for (const m of memories) {
    const s = (m.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((x) => words.has(x)).length;
    if (s > score) {
      score = s;
      best = m;
    }
  }
  return score >= 1 ? best : null;
}

// ---------------------------------------------------------------- orders

const TASK_WORDS: [RegExp, AiTask][] = [
  [/\b(shop|store|merch|designs?|shirts?|tees?|candles?|posters?|products?)\b/i, "shop_designs"],
  [/\b(freelance|gigs?|clients?)\b/i, "freelance_gigs"],
  [/\b(music|tracks?|songs?|beats?|album)\b/i, "music_tracks"],
  [/\b(social|posts?|content|followers|tiktok|insta|videos?)\b/i, "social_content"],
  [/\b(research|data|analysis|r&d)\b/i, "research"],
  [/\b(operations|ops|manage|management)\b/i, "operations"],
  [/\b(experiments?)\b/i, "experiments"],
];

const ORDER_CUE = /\b(go|work|focus|switch|start|get on|help|move|handle|take over|jump on|you're on|i need you)\b/i;

/** Detect simple orders like "go work on the shop" or "take a break". */
export function detectOrder(message: string): AiAction | null {
  const m = message.toLowerCase();
  if (/\b(take a break|go rest|get some rest|take five|chill out|go to the (chill|bar))\b/.test(m)) return { type: "takeBreak" };
  const room = m.match(/\bgo to (?:the )?(war room|command|revenue bay|treasury|factory|server room|servers)\b/);
  if (room) {
    const map: Record<string, AiAction> = {
      "war room": { type: "goTo", room: "WAR_ROOM" },
      command: { type: "goTo", room: "COMMAND" },
      "revenue bay": { type: "goTo", room: "REVENUE_BAY" },
      treasury: { type: "goTo", room: "TREASURY" },
      factory: { type: "goTo", room: "FACTORY" },
      "server room": { type: "goTo", room: "SERVER_ROOM" },
      servers: { type: "goTo", room: "SERVER_ROOM" },
    };
    if (!/\b(work on|focus on)\b/.test(m)) return map[room[1]];
  }
  if (!ORDER_CUE.test(m) || /\?\s*$/.test(m)) return null;
  for (const [re, task] of TASK_WORDS) if (re.test(m)) return { type: "assignTask", task };
  return null;
}

// ---------------------------------------------------------------- voice

interface Voice {
  hi: string[];
  status: (w: WorkerBrief) => string[];
  ack: (task: string) => string[];
  thanks: string[];
  noted: (fact: string) => string[];
  recall: (answer: string) => string[];
  dunno: string[];
  chatter: string[];
  tired: string[];
  grumpy: string[];
  raise: string[];
  breakOk: string[];
}

const GENERIC: Voice = {
  hi: ["hey boss", "hey, what's up?"],
  status: (w) => [`all good. working on ${w.task.toLowerCase()}`, `busy with ${w.task.toLowerCase()}, going ok`],
  ack: (task) => [`on it, switching to ${task.toLowerCase()}`, `ok, ${task.toLowerCase()} it is`],
  thanks: ["thanks boss", "appreciate it"],
  noted: (f) => [`noted: ${f.toLowerCase()}`, `got it, I'll remember that`],
  recall: (a) => [`${a}. you told me already`, `easy, it's ${a}`],
  dunno: ["hmm, I don't think you ever told me", "no idea, you never said"],
  chatter: ["haha fair", "true", "ok, I hear you", "interesting. anything else?"],
  tired: ["so tired", "need a break soon", "…yeah"],
  grumpy: ["sure. whatever you say.", "fine."],
  raise: ["while we're talking... can we talk about my pay?", "honestly I think I'm underpaid"],
  breakOk: ["thank you, heading to the bar", "finally. couch time"],
};

const VOICES: Record<string, Partial<Voice>> = {
  matt: {
    hi: ["Morning. What do you need?", "Hey. Quick one, I have a checklist going."],
    status: (w) => [`Operations are on track. ${w.task}. I'll flag anything urgent.`, "Running smooth. Someone should approve the Factory queue though."],
    ack: (t) => [`Understood. I'll move to ${t.toLowerCase()} and update the plan.`],
    noted: (f) => [`Noted. ${f}. Filed.`],
    recall: (a) => [`${a}. I keep notes.`],
    chatter: ["Fair point. Let's put it on the agenda.", "Agreed. I'd add a deadline though."],
    grumpy: ["Noted.", "I'll handle it. As usual."],
  },
  finn: {
    hi: ["yo. a client just asked for 'one tiny change' for the fifth time", "hey. save me from these clients"],
    status: () => ["gigs are getting done. clients are still the worst", "fine. one client wants a logo 'but more blue'"],
    ack: (t) => [`fine, ${t.toLowerCase()}. at least no clients there`, `ok ok, ${t.toLowerCase()}. on it`],
    noted: (f) => [`noted. ${f.toLowerCase()}. more useful than client feedback`],
    recall: (a) => [`${a}. I listen, unlike my clients`],
    chatter: ["lol sure", "yeah no", "honestly same"],
  },
  dennis: {
    hi: ["hi! I was just modeling our retention curve", "oh hey! did you see the numbers today?"],
    status: () => ["statistically speaking, things are up ~4%. technically.", "good! I made a spreadsheet about it. three, actually"],
    ack: (t) => [`ok. pivoting to ${t.toLowerCase()}. I'll need a new spreadsheet`],
    noted: (f) => [`logged in my notes: ${f.toLowerCase()} 📊`, `noted! ${f.toLowerCase()}. data point saved`],
    recall: (a) => [`${a}! I have it in my notes`, `easy, ${a}. 100% confidence interval`],
    chatter: ["interesting. I'd want more data though", "technically that's correct", "hmm, let me overthink that"],
  },
  pham: {
    hi: ["yo boss 🎧", "heyy, just finished a beat"],
    status: () => ["vibes are good. cooking a track rn", "chillin, mixing something late-night style"],
    ack: (t) => [`cool cool, moving to ${t.toLowerCase()}`, `bet, ${t.toLowerCase()}. lemme grab my headphones`],
    noted: (f) => [`noted, ${f.toLowerCase()}. good vibes`],
    recall: (a) => [`${a}, right? I remember`],
    chatter: ["yeah that's a vibe", "mm true", "nice"],
  },
  bunc: {
    hi: ["HEY BOSS 👋✨", "hiiii 🛍️💖"],
    status: () => ["SALES ARE POPPING 🔥💸", "listing new stuff rn 🛍️🚀 approve my designs pls 🙏"],
    ack: (t) => [`ON IT 🏃‍♀️💨 ${t.toLowerCase()} lets gooo 🚀`],
    thanks: ["THANK U BOSS 💸💖", "yesss ty 🥹✨"],
    noted: (f) => [`noted!!! ${f.toLowerCase()} ✨📝`, `omg cute, ${f.toLowerCase()} 💖`],
    recall: (a) => [`${a}!!! duh 😎✨`, `it's ${a} 💖 i remember everything`],
    chatter: ["omg yes 🔥", "LOL 😂", "100% 💯"],
    grumpy: ["ok 🙃", "sure 😐"],
  },
  luke: {
    hi: ["yo boss what's good", "ayy boss 🔥"],
    status: () => ["content is eating rn no cap", "followers going up fr. we're so back"],
    ack: (t) => [`bet. ${t.toLowerCase()}, say less`, `say less, switching to ${t.toLowerCase()}`],
    noted: (f) => [`noted fr, ${f.toLowerCase()}`, `bet, ${f.toLowerCase()}. locked in`],
    recall: (a) => [`${a}, no cap`, `it's ${a} fr`],
    chatter: ["lowkey valid", "that's a W", "fr fr"],
    grumpy: ["that's an L but ok", "k"],
  },
  maverick: {
    hi: ["greetings. the experiment continues.", "boss. I have an idea. you won't like it."],
    status: () => ["phase 2 of the experiment is underway. don't ask about phase 1.", "something is bubbling. could be revenue. could be smoke."],
    ack: (t) => [`interesting. ${t.toLowerCase()}. I'll make it weird`, `fine. ${t.toLowerCase()}. results may vary`],
    noted: (f) => [`${f.toLowerCase()}. stored in the vault of my mind`],
    recall: (a) => [`${a}. I remember everything. it's a curse.`],
    chatter: ["intriguing", "chaos approves", "hmm. what if we did the opposite?"],
  },
};

function v(id: string): Voice {
  return { ...GENERIC, ...VOICES[id] };
}

/** A scripted chat reply that fits the worker's persona and mood. */
export function scriptedChat(worker: WorkerBrief, memories: string[], message: string, rng: Rng = Math.random): ChatResult {
  const voice = v(worker.id);
  const m = message.toLowerCase();
  const newMemory = extractMemory(message);
  let action = detectOrder(message);
  let reply: string;

  const recalled = recallFromMemory(message, memories);
  if (action?.type === "assignTask") reply = pick(voice.ack(TASK_LABEL[action.task]), rng);
  else if (action?.type === "takeBreak") reply = pick(voice.breakOk, rng);
  else if (action?.type === "goTo") reply = pick(["on my way", "heading there now", "ok, walking over"], rng);
  else if (newMemory) reply = pick(voice.noted(newMemory.replace(/^Boss's /, "your ")), rng);
  else if (recalled) reply = pick(voice.recall(recalled), rng);
  else if (/\bmy (favou?rite|name)\b.*\?/.test(m) || /\bdo you remember\b/.test(m)) reply = pick(voice.dunno, rng);
  else if (/\b(thanks|thank you|good job|great work|nice work|proud)\b/.test(m)) reply = pick(voice.thanks, rng);
  else if (/\b(how are|how's it|how is it|what's up|status|update|how are things)\b/.test(m)) reply = pick(voice.status(worker), rng);
  else if (/^(hi|hey|yo|hello|sup|morning)\b/.test(m)) reply = pick(voice.hi, rng);
  else reply = pick(voice.chatter, rng);

  // Mood colors the reply.
  if (worker.energy < 20 && !action) reply = pick(voice.tired, rng);
  else if (worker.mood < 25 && rng() < 0.6) reply = pick(voice.grumpy, rng);

  const underpaid = worker.salary < worker.fairSalary * 0.9;
  if (!action && underpaid && worker.loyalty < 55 && rng() < 0.3) {
    reply += `\n${pick(voice.raise, rng)}`;
    action = { type: "askRaise", amount: Math.max(10, Math.min(100, Math.round((worker.fairSalary - worker.salary) / 5) * 5)) };
  }
  const moodDelta = /\b(thanks|great|awesome|good job|proud|love)\b/.test(m) ? 3 : /\b(lazy|bad|terrible|fired|useless|stupid)\b/.test(m) ? -6 : 0;
  return { reply, action, newMemory, moodDelta };
}

// ---------------------------------------------------------------- initiated messages

export type Situation = "tired" | "grumpy" | "raise" | "mission" | "approval" | "celebrate" | "smalltalk";

export function scriptedInitiate(worker: WorkerBrief, situation: Situation, detail: string, rng: Rng = Math.random): InitiateResult {
  const voice = v(worker.id);
  switch (situation) {
    case "tired":
      return { text: pick(["running on fumes here", "gonna need a break soon", "I can barely keep my eyes open"], rng), action: null };
    case "grumpy":
      return { text: pick(["not gonna lie, today's been rough", "can we talk sometime? things feel off", ...voice.grumpy], rng), action: null };
    case "raise": {
      const amount = Math.max(10, Math.min(100, Math.round((worker.fairSalary - worker.salary) / 5) * 5));
      return { text: pick(voice.raise, rng), action: { type: "askRaise", amount } };
    }
    case "mission":
      return { text: `quick update: ${detail}`, action: null };
    case "approval":
      return { text: `${detail} is waiting for your approval in the Factory`, action: null };
    case "celebrate":
      return { text: pick([`we're having a great day: ${detail}`, `did you see? ${detail} 🎉`], rng), action: null };
    default:
      return { text: pick(voice.status(worker), rng), action: null };
  }
}

// ---------------------------------------------------------------- meetings

const TOPIC_TASK: [RegExp, AiTask, string][] = [
  [/product|shop|merch|drop|design|shirt|launch/i, "shop_designs", "shop"],
  [/market|social|brand|followers|viral|content/i, "social_content", "social"],
  [/music|song|track|album/i, "music_tracks", "music"],
  [/client|freelance|gig/i, "freelance_gigs", "freelance"],
  [/research|data|innovation|r&d/i, "research", "research"],
];

const IDEAS: Record<string, (topic: string) => string> = {
  matt: (t) => `Okay team, agenda item one: ${t}. Let's leave with owners and deadlines.`,
  finn: () => "Before we dream big, can we talk about how clients keep changing everything?",
  dennis: (t) => `I ran the numbers on ${t}. Technically, a 12% bump is possible if we focus.`,
  pham: () => "What if we tie it to a soundtrack? A drop with its own track is a vibe.",
  bunc: () => "NEW SHIRT DROP 🔥 neon cats!!! they will SELL 💸💸",
  luke: () => "If we don't post it, it didn't happen. I can make this go viral, no cap.",
  maverick: () => "Hear me out: glow-in-the-dark candles that hum. Phase 1 is already in my locker.",
};

const REACTIONS = [
  (a: string, b: string) => `${b}, that's ambitious. ${a === "Matt" ? "I like it, with a deadline." : "I'm in."}`,
  (_a: string, b: string) => `No offense ${b}, but that sounds expensive.`,
  (_a: string, b: string) => `Okay ${b}, I can see it. What's the budget?`,
  (_a: string, b: string) => `${b} is onto something. Let's test it small first.`,
];

/** A scripted meeting: at least 3 speakers (when possible) and at least one applicable decision. */
export function scriptedMeeting(topic: string, attendees: WorkerBrief[], rng: Rng = Math.random): MeetingResult {
  const people = [...attendees].sort(() => rng() - 0.5);
  const lines: MeetingLine[] = [];
  const say = (w: WorkerBrief, text: string) => lines.push({ speaker: w.name, text });

  for (const w of people.slice(0, 4)) say(w, (IDEAS[w.id] ?? ((t: string) => `About ${t}: I think we can do better than last week.`))(topic));
  for (let i = 0; i < Math.min(3, people.length); i++) {
    const a = people[(i + 1) % people.length];
    const b = people[i];
    say(a, pick(REACTIONS, rng)(a.name, b.name));
  }
  const lead = people.find((p) => p.id === "matt") ?? people[0];
  say(lead, "Alright, decision time. Here's what we're doing.");

  const match = TOPIC_TASK.find(([re]) => re.test(topic));
  const task: AiTask = match?.[1] ?? "shop_designs";
  const business = (match?.[2] ?? "shop") as "shop" | "social" | "music" | "freelance" | "research";
  const owner = people.find((p) => p.focus !== "ops") ?? people[0];
  const decisions: MeetingDecision[] = [
    { summary: `${owner.name} focuses on ${TASK_LABEL[task].toLowerCase()}`, action: { type: "assignTask", worker: owner.id, task } },
    { summary: `Raise the ${business} budget to $150/day`, action: { type: "setBudget", business, amount: 150 } },
  ];
  return { lines: lines.slice(0, 12), decisions };
}

/** A short scripted reaction when the boss speaks during a meeting. */
export function scriptedMeetingReply(playerLine: string, attendees: WorkerBrief[], rng: Rng = Math.random): MeetingResult {
  const people = [...attendees].sort(() => rng() - 0.5).slice(0, 3);
  const lines: MeetingLine[] = people.map((w, i) => ({
    speaker: w.name,
    text:
      i === 0
        ? pick([`Good point, boss. "${playerLine.slice(0, 60)}" noted.`, "Boss has a point.", "Okay, let's adjust for that."], rng)
        : pick(v(w.id).chatter, rng),
  }));
  const order = detectOrder(playerLine);
  const decisions: MeetingDecision[] =
    order?.type === "assignTask" && people[0]
      ? [{ summary: `${people[0].name} takes on ${TASK_LABEL[order.task].toLowerCase()}`, action: { type: "assignTask", worker: people[0].id, task: order.task } }]
      : [];
  return { lines, decisions };
}
