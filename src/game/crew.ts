import { COLORS } from "./constants";
import { FOCUS_ROOM } from "./business";
import type { Focus, Worker, WorkerLook } from "./types";

export interface CrewSeed {
  id: string;
  name: string;
  role: string;
  personality: string;
  look: WorkerLook;
  salary: number;
  skill: number;
  speed: number;
  focus: Focus;
  task: string;
}

const SKIN = { light: "#f1c7a5", tan: "#d29b6c", brown: "#9c6644", deep: "#6b4226", pale: "#ffe0c8" };

export const CREW_SEEDS: CrewSeed[] = [
  {
    id: "matt",
    name: "Matt",
    role: "Operations Manager",
    personality: "Calm, organized, loyal, a bit bossy",
    look: { skin: SKIN.light, hair: "#5b3a22", hairStyle: "short", outfit: "#2b7bd6", pants: "#22263a", accessory: "glasses", accent: "#111118" },
    salary: 220,
    skill: 72,
    speed: 60,
    focus: "ops",
    task: "Running operations",
  },
  {
    id: "finn",
    name: "Finn",
    role: "Freelance Fulfillment",
    personality: "Fast, sarcastic, always complains about clients",
    look: { skin: SKIN.tan, hair: "#e0a33a", hairStyle: "short", outfit: COLORS.orange, pants: "#2a2a3a", accessory: "cap", accent: "#2b2b44" },
    salary: 160,
    skill: 64,
    speed: 82,
    focus: "freelance",
    task: "Delivering client gigs",
  },
  {
    id: "dennis",
    name: "Dennis",
    role: "Research and Strategy",
    personality: "Nerdy, overthinks, loves data",
    look: { skin: SKIN.pale, hair: "#2b1b12", hairStyle: "spiky", outfit: "#2fae6a", pants: "#3a3046", accessory: "glasses", accent: "#111118" },
    salary: 180,
    skill: 78,
    speed: 48,
    focus: "research",
    task: "Crunching market data",
  },
  {
    id: "pham",
    name: "Pham",
    role: "AI Music Producer",
    personality: "Chill, creative, night owl",
    look: { skin: SKIN.tan, hair: "#14121c", hairStyle: "long", outfit: COLORS.purple, pants: "#1e1e2c", accessory: "headphones", accent: COLORS.cyan },
    salary: 170,
    skill: 70,
    speed: 55,
    focus: "music",
    task: "Producing a lo-fi track",
  },
  {
    id: "bunc",
    name: "Bunc",
    role: "Shop Executor",
    personality: "Hyper, emoji-heavy, sales-obsessed",
    look: { skin: SKIN.light, hair: COLORS.pink, hairStyle: "bun", outfit: COLORS.yellow, pants: "#2c2440", accessory: "none", accent: COLORS.pink },
    salary: 150,
    skill: 62,
    speed: 75,
    focus: "shop",
    task: "Listing shop products",
  },
  {
    id: "luke",
    name: "Luke",
    role: "Social Media Marketing",
    personality: "Trend chaser, confident, talks in slang",
    look: { skin: SKIN.brown, hair: "#1a120c", hairStyle: "mohawk", outfit: COLORS.pink, pants: "#202034", accessory: "shades", accent: "#0a0a12" },
    salary: 165,
    skill: 66,
    speed: 70,
    focus: "social",
    task: "Posting trend content",
  },
  {
    id: "maverick",
    name: "Maverick",
    role: "Autonomous Experiment",
    personality: "Unpredictable, risky ideas, wildcard",
    look: { skin: SKIN.deep, hair: "#14121c", hairStyle: "short", outfit: "#1c1c26", pants: "#14141c", accessory: "skull", accent: COLORS.green },
    salary: 190,
    skill: 74,
    speed: 65,
    focus: "wild",
    task: "Running a weird experiment",
  },
];

const SEED_RELATIONSHIPS: Record<string, Record<string, number>> = {
  matt: { dennis: 30, finn: -10, maverick: -20 },
  finn: { luke: 25, matt: -10 },
  dennis: { matt: 30, maverick: -15 },
  pham: { maverick: 35, luke: 10 },
  bunc: { luke: 40, finn: 15 },
  luke: { bunc: 40, finn: 25 },
  maverick: { pham: 35, matt: -20 },
};

export function createWorker(seed: CrewSeed, floor: number, x: number, rng: () => number = Math.random): Worker {
  const relationships: Record<string, number> = {};
  for (const other of CREW_SEEDS) {
    if (other.id !== seed.id) relationships[other.id] = SEED_RELATIONSHIPS[seed.id]?.[other.id] ?? 0;
  }
  return {
    id: seed.id,
    name: seed.name,
    role: seed.role,
    personality: seed.personality,
    look: seed.look,
    salary: seed.salary,
    skill: seed.skill,
    speed: seed.speed,
    mood: 70,
    energy: 70 + Math.round(rng() * 30),
    loyalty: 60,
    task: seed.task,
    taskProgress: 0,
    homeRoom: FOCUS_ROOM[seed.focus],
    focus: seed.focus,
    cycleWork: 0,
    boost: null,
    lowLoyaltyDays: 0,
    lastTextAt: -1e9,
    relationships,
    memories: [],
    earned: 0,
    spent: 0,
    floor,
    x,
    y: 0,
    facing: 1,
    route: [],
    activity: "idle",
    target: null,
    timer: 0,
    bubble: null,
  };
}
