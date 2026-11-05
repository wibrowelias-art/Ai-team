/** Hiring and firing. Candidates are generated per game day. */
import { findRoom } from "./building";
import { FOCUS_ROOM } from "./business";
import { COLORS } from "./constants";
import { clamp, draftOf, log, nextId, say, spend } from "./draft";
import { fairSalary } from "./economy";
import { removeWorker } from "./events";
import { pickSpot, sendWorker, WORK_KINDS, type Rng } from "./movement";
import { dayOf } from "./time";
import type { Accessory, Candidate, Focus, GameState, HairStyle, Worker } from "./types";

export const MAX_CREW = 12;
export const REROLL_COST = 100;

const FIRST = ["Nova", "Rex", "Kai", "Juno", "Ziggy", "Mika", "Orion", "Pixel", "Sasha", "Remy", "Tao", "Vex", "Luna", "Ash", "Coda", "Iris", "Bo", "Neo"];

const ROLES: { focus: Focus; role: string; bios: string[]; personalities: string[] }[] = [
  {
    focus: "shop",
    role: "Merch Designer",
    bios: ["Ran a sticker shop that sold out in a weekend.", "Designs tees that look good under blacklight."],
    personalities: ["Bubbly, perfectionist, loves color palettes", "Quiet, artsy, secretly very competitive"],
  },
  {
    focus: "freelance",
    role: "Freelance Closer",
    bios: ["Has a spreadsheet of 400 past clients.", "Can turn a 'quick question' into a paid gig."],
    personalities: ["Smooth talker, a bit of a hustler", "Grumpy but extremely reliable"],
  },
  {
    focus: "music",
    role: "Beat Maker",
    bios: ["Has 3 million streams on a lo-fi playlist.", "Samples vending machines and makes them slap."],
    personalities: ["Dreamy, nocturnal, speaks in metaphors", "Loud, confident, always humming"],
  },
  {
    focus: "social",
    role: "Content Creator",
    bios: ["Went viral twice. Won't stop talking about it.", "Edits videos faster than you can watch them."],
    personalities: ["Meme lord, sarcastic, chronically online", "Upbeat, hype-driven, loves a challenge"],
  },
  {
    focus: "research",
    role: "Data Analyst",
    bios: ["Built a model that predicts snack demand.", "Has opinions about chart colors."],
    personalities: ["Precise, deadpan, loves graphs", "Curious, chatty, asks a lot of questions"],
  },
  {
    focus: "ops",
    role: "Ops Coordinator",
    bios: ["Organized a festival for 5,000 people.", "Color-codes everything, including lunch."],
    personalities: ["Calm, structured, gently strict", "Warm, motherly, keeps everyone fed"],
  },
  {
    focus: "wild",
    role: "Robot Intern",
    bios: ["A prototype android that wants to learn business.", "Unclear origin. Excellent at spreadsheets."],
    personalities: ["Literal, curious about humans, oddly funny", "Polite, glitchy, overly enthusiastic"],
  },
];

const SKINS = ["#f1c7a5", "#d29b6c", "#9c6644", "#6b4226", "#ffe0c8"];
const HAIRS = ["#14121c", "#5b3a22", "#e0a33a", "#c94a2a", "#f4f4ff", COLORS.cyan, COLORS.purple, COLORS.green];
const OUTFITS = [COLORS.pink, COLORS.cyan, COLORS.purple, COLORS.green, COLORS.orange, COLORS.yellow, "#2b7bd6", "#2a2a3a"];
const STYLES: HairStyle[] = ["short", "long", "spiky", "bald", "mohawk", "bun"];
const ACCESSORIES: Accessory[] = ["none", "none", "cap", "beanie", "headphones", "glasses", "shades"];

const pick = <T,>(a: T[], rng: Rng): T => a[Math.floor(rng() * a.length)];

export function generateCandidates(s: GameState, rng: Rng, n = 3): Candidate[] {
  const taken = new Set(s.workers.map((w) => w.name));
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const r = pick(ROLES, rng);
    let name = pick(FIRST, rng);
    for (let k = 0; k < 10 && (taken.has(name) || out.some((c) => c.name === name)); k++) name = pick(FIRST, rng);
    const skill = Math.round(45 + rng() * 45);
    // Asks are around fair pay, sometimes a bargain, sometimes greedy.
    const salary = Math.round((fairSalary(skill) * (0.8 + rng() * 0.45)) / 5) * 5;
    const robot = r.focus === "wild";
    out.push({
      id: `cand${s.seq + i + 1}-${Math.floor(rng() * 1e6)}`,
      name,
      role: r.role,
      focus: r.focus,
      personality: pick(r.personalities, rng),
      bio: pick(r.bios, rng),
      skill,
      speed: Math.round(45 + rng() * 45),
      salary,
      look: {
        skin: robot ? "#9aa3b5" : pick(SKINS, rng),
        hair: pick(HAIRS, rng),
        hairStyle: robot ? "bald" : pick(STYLES, rng),
        outfit: pick(OUTFITS, rng),
        pants: "#22263a",
        accessory: robot ? "robot" : pick(ACCESSORIES, rng),
        accent: pick([COLORS.cyan, COLORS.pink, COLORS.yellow, "#24242e"], rng),
      },
    });
  }
  return out;
}

/** Make sure today's candidates exist (free once per game day). */
export function ensureCandidates(state: GameState, rng: Rng): GameState {
  const day = dayOf(state.minutes);
  if (state.candidatesDay === day && state.candidates.length > 0) return state;
  return { ...state, candidates: generateCandidates(state, rng), candidatesDay: day };
}

export interface Result {
  state: GameState;
  error: string | null;
}

export function rerollCandidates(state: GameState, rng: Rng): Result {
  if (state.cash < REROLL_COST) return { state, error: `A new shortlist costs $${REROLL_COST}.` };
  const s = draftOf(state);
  spend(s, "events", REROLL_COST);
  s.candidates = generateCandidates(s, rng);
  s.candidatesDay = dayOf(s.minutes);
  log(s, `Paid a recruiter $${REROLL_COST} for a new shortlist.`, "info");
  return { state: s, error: null };
}

/** Hire a candidate. Costs a signing bonus of one day's salary. */
export function hire(state: GameState, candidateId: string, rng: Rng): Result {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return { state, error: "That candidate is gone." };
  if (state.workers.length >= MAX_CREW) return { state, error: `The building fits ${MAX_CREW} people. Fire someone first.` };
  if (state.cash < c.salary) return { state, error: `Not enough cash for ${c.name}'s $${c.salary} signing bonus.` };
  const s = draftOf(state);
  const home = findRoom(s.building, FOCUS_ROOM[c.focus]) ?? s.building.rooms[0];
  const id = `${c.name.toLowerCase()}-${nextId(s, "")}`;
  const w: Worker = {
    id,
    name: c.name,
    role: c.role,
    personality: c.personality,
    look: c.look,
    salary: c.salary,
    skill: c.skill,
    speed: c.speed,
    mood: 75,
    energy: 90,
    loyalty: 55,
    task: "Settling in",
    taskProgress: 0,
    homeRoom: home.id,
    relationships: Object.fromEntries(s.workers.map((o) => [o.id, 0])),
    memories: [],
    earned: 0,
    spent: 0,
    // Arrives on the ground floor by the entrance and walks to their desk.
    floor: s.building.floors - 1,
    x: 14,
    y: 0,
    facing: 1,
    route: [],
    activity: "idle",
    target: null,
    timer: 0,
    bubble: { icon: "idea", until: s.minutes + 20 },
    focus: c.focus,
    cycleWork: 0,
    boost: null,
    lowLoyaltyDays: 0,
    lastTextAt: s.minutes,
  };
  for (const o of s.workers) o.relationships = { ...o.relationships, [id]: 0 };
  sendWorker(w, home, pickSpot(home, WORK_KINDS, s.workers, rng, id) ?? 0, "working");
  s.workers = [...s.workers, w];
  s.candidates = s.candidates.filter((x) => x.id !== candidateId);
  spend(s, "salaries", c.salary, w);
  say(s, id, `hi boss! ${c.name} here. excited to start 🙌`);
  log(s, `Hired ${c.name}, ${c.role} ($${c.salary}/day).`, "good");
  return { state: s, error: null };
}

/** Fire a worker. Severance is one day's salary. The crew reacts. */
export function fire(state: GameState, workerId: string, rng: Rng): Result {
  const w = state.workers.find((x) => x.id === workerId);
  if (!w) return { state, error: "That worker is not on the crew." };
  if (state.workers.length <= 1) return { state, error: "You can't fire your last worker." };
  const s = draftOf(state);
  const severance = w.salary;
  spend(s, "salaries", severance);
  // Friends take it harder.
  const friends = s.workers.filter((o) => o.id !== w.id && (o.relationships[w.id] ?? 0) > 20);
  removeWorker(s, w.id, `was fired ($${severance} severance).`);
  for (const o of s.workers) o.loyalty = clamp(o.loyalty - 3);
  const reactor = friends[0] ?? s.workers[Math.floor(rng() * s.workers.length)];
  if (reactor) {
    const text = friends.length
      ? `you fired ${w.name}?? they were my friend…`
      : pick([`wow, ${w.name} is gone? ok then`, `so… are we all on thin ice now?`, `rip ${w.name}. their desk is already cold`], rng);
    say(s, reactor.id, text);
    reactor.bubble = { icon: "angry", until: s.minutes + 30 };
  }
  return { state: s, error: null };
}
