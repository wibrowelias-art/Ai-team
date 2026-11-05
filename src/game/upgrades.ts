/** Building, room upgrades and shop upgrades: costs and what they do. */
import { roomByType } from "./building";
import type { GameState, RoomType, UpgradeId, Worker } from "./types";

export type { UpgradeId };

export const SHOP_UPGRADES: Record<UpgradeId, { name: string; icon: string; blurb: string; costs: number[] }> = {
  coffee: { name: "Coffee machine", icon: "☕", blurb: "Workers burn energy 15% slower per level.", costs: [400, 900, 1800] },
  pcs: { name: "Better PCs", icon: "🖥️", blurb: "+6% output for everyone per level.", costs: [800, 1600, 3200] },
  pool: { name: "Pool table", icon: "🎱", blurb: "Breaks restore energy and mood 20% faster per level.", costs: [500, 1000, 2000] },
  server_rack: { name: "Server rack", icon: "🗄️", blurb: "Faster AI: +5% output and +10% research per level.", costs: [1000, 2000, 4000] },
  neon_sign: { name: "Neon sign", icon: "🌟", blurb: "+15% social follower growth per level.", costs: [600, 1200, 2400] },
};

export const UPGRADE_IDS = Object.keys(SHOP_UPGRADES) as UpgradeId[];
export const MAX_UPGRADE_LEVEL = 3;
export const MAX_ROOM_LEVEL = 5;
export const MAX_FLOORS = 4;
export const ADD_FLOOR_COST = 6000;

/** Cost to build a locked room. */
export const BUILD_COST: Partial<Record<RoomType, number>> = {
  MARKETING_LAB: 2500,
  RECORDING_STUDIO: 2500,
  VAULT: 4000,
  ROOFTOP_LOUNGE: 3500,
  TRADING_DESK: 5000,
};

/** What a built room adds. Shown in the UI. */
export const ROOM_EFFECT: Partial<Record<RoomType, string>> = {
  COMMAND: "+8% output per level for Research and Operations.",
  WAR_ROOM: "+8% output per level for anyone working here.",
  REVENUE_BAY: "+8% output per level for Social.",
  TREASURY: "+8% output per level for Freelance.",
  FACTORY: "+8% output per level for Shop and Experiments.",
  CHILL: "Breaks restore 10% faster per level.",
  SERVER_ROOM: "+5% output for the whole crew per level, +8% for Music.",
  MARKETING_LAB: "Social income and growth +25%, +5% per extra level.",
  RECORDING_STUDIO: "Music income and fan growth +25%, +5% per extra level.",
  VAULT: "Event costs and refunds are halved.",
  ROOFTOP_LOUNGE: "Every day: +3 mood and +1 loyalty for the crew, more per level.",
  TRADING_DESK: "Idle cash earns 0.4% a day (max $400, more per level).",
};

/** Cost to go from `level` to `level + 1`. */
export function roomUpgradeCost(level: number): number {
  return Math.round((600 * Math.pow(level, 1.5)) / 50) * 50;
}

export function upgradeCost(id: UpgradeId, level: number): number | null {
  return SHOP_UPGRADES[id].costs[level] ?? null;
}

function level(s: GameState, type: RoomType): number {
  const r = roomByType(s.building, type);
  return r && !r.locked ? r.level : 0;
}

function upgrade(s: GameState, id: UpgradeId): number {
  return s.upgrades?.[id] ?? 0;
}

export interface Effects {
  /** multiplier on a worker's output */
  output: (w: Worker) => number;
  energyDrain: number;
  restRate: number;
  socialGrowth: number;
  socialIncome: number;
  musicGrowth: number;
  musicIncome: number;
  researchRate: number;
  eventCost: number;
  dailyMood: number;
  dailyLoyalty: number;
  interestRate: number;
  interestCap: number;
}

/** Combined effect of rooms and upgrades. Cheap: compute once per step/cycle. */
export function effects(s: GameState): Effects {
  const roomLevel = new Map(s.building.rooms.filter((r) => !r.locked).map((r) => [r.id, r.level]));
  const server = level(s, "SERVER_ROOM");
  const crewMult = (1 + 0.06 * upgrade(s, "pcs")) * (1 + 0.05 * upgrade(s, "server_rack")) * (1 + 0.05 * Math.max(0, server - 1));
  const lab = level(s, "MARKETING_LAB");
  const studio = level(s, "RECORDING_STUDIO");
  const lounge = level(s, "ROOFTOP_LOUNGE");
  const desk = level(s, "TRADING_DESK");
  return {
    output: (w) => {
      const home = roomLevel.get(w.homeRoom) ?? 1;
      const music = w.focus === "music" ? 1 + 0.08 * Math.max(0, server - 1) : 1;
      return crewMult * (1 + 0.08 * Math.max(0, home - 1)) * music;
    },
    energyDrain: 1 - 0.15 * upgrade(s, "coffee"),
    restRate: (1 + 0.2 * upgrade(s, "pool")) * (1 + 0.1 * Math.max(0, level(s, "CHILL") - 1)),
    socialGrowth: (1 + 0.15 * upgrade(s, "neon_sign")) * (lab ? 1.2 + 0.05 * (lab - 1) : 1),
    socialIncome: lab ? 1.25 + 0.05 * (lab - 1) : 1,
    musicGrowth: studio ? 1.2 + 0.05 * (studio - 1) : 1,
    musicIncome: studio ? 1.25 + 0.05 * (studio - 1) : 1,
    researchRate: 1 + 0.1 * upgrade(s, "server_rack"),
    eventCost: level(s, "VAULT") ? 0.5 : 1,
    dailyMood: lounge ? 3 + (lounge - 1) : 0,
    dailyLoyalty: lounge ? 1 + 0.5 * (lounge - 1) : 0,
    interestRate: desk ? 0.004 + 0.001 * (desk - 1) : 0,
    interestCap: desk ? 400 + 200 * (desk - 1) : 0,
  };
}
