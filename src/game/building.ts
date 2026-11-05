import { BUILDING_X, COLORS, COLUMNS, FLOOR_H, GROUND_H, ROOF_H, SHAFT, SHAFT_CENTER_X, SLAB_H, WORLD_W } from "./constants";
import type { BuildingState, RoomSlot, RoomType, Spot } from "./types";

export interface RoomDef {
  name: string;
  sign: string;
  color: string;
  blurb: string;
  spots: Spot[];
}

const d = (dx: number, kind: Spot["kind"], face: 1 | -1 = 1): Spot => ({ dx, kind, face });

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  COMMAND: {
    name: "Command",
    sign: "COMMAND",
    color: COLORS.cyan,
    blurb: "Mission Control. Crew list, roles, current tasks and mood. Assign missions here.",
    spots: [d(7, "desk"), d(31, "desk"), d(54, "stand", -1)],
  },
  WAR_ROOM: {
    name: "War Room",
    sign: "WAR ROOM",
    color: COLORS.red,
    blurb: "Meetings. Call a meeting with a topic and watch the crew argue it out.",
    spots: [d(12, "chair"), d(22, "chair"), d(42, "chair", -1), d(52, "chair", -1), d(32, "stand")],
  },
  REVENUE_BAY: {
    name: "Revenue Bay",
    sign: "REVENUE",
    color: COLORS.green,
    blurb: "Income. Every business, every dollar, and the 30-day chart.",
    spots: [d(7, "desk"), d(31, "desk"), d(54, "stand", -1)],
  },
  TREASURY: {
    name: "Treasury",
    sign: "TREASURY",
    color: COLORS.yellow,
    blurb: "Spending. Salaries, budgets and where the money goes.",
    spots: [d(7, "desk"), d(31, "desk"), d(55, "stand", -1)],
  },
  FACTORY: {
    name: "Factory",
    sign: "FACTORY",
    color: COLORS.orange,
    blurb: "Production. Designs move from Pending to Done on the kanban board.",
    spots: [d(5, "bench"), d(23, "bench"), d(41, "bench"), d(58, "stand", -1)],
  },
  CHILL: {
    name: "Chill / Bar",
    sign: "CHILL BAR",
    color: COLORS.pink,
    blurb: "Break room. Pool table, arcade and a couch. Tired workers recover here.",
    spots: [d(9, "couch"), d(20, "couch"), d(32, "pool"), d(54, "arcade")],
  },
  SERVER_ROOM: {
    name: "Server Room",
    sign: "SERVERS",
    color: COLORS.purple,
    blurb: "Racks of humming compute. Better servers make the crew faster.",
    spots: [d(39, "rack", -1), d(56, "stand", -1)],
  },
  RECORDING_STUDIO: {
    name: "Recording Studio",
    sign: "STUDIO",
    color: COLORS.purple,
    blurb: "Boosts Music income and fan growth.",
    spots: [d(9, "desk"), d(46, "stand")],
  },
  MARKETING_LAB: {
    name: "Marketing Lab",
    sign: "MARKETING",
    color: COLORS.pink,
    blurb: "Boosts Social income and follower growth.",
    spots: [d(7, "desk"), d(31, "desk")],
  },
  VAULT: {
    name: "Vault",
    sign: "VAULT",
    color: COLORS.yellow,
    blurb: "Protects cash: event costs and refunds are halved.",
    spots: [d(40, "stand")],
  },
  ROOFTOP_LOUNGE: {
    name: "Sky Lounge",
    sign: "LOUNGE",
    color: COLORS.cyan,
    blurb: "Big daily mood and loyalty boost for the whole crew.",
    spots: [d(17, "couch"), d(45, "bar")],
  },
  TRADING_DESK: {
    name: "Trading Desk",
    sign: "TRADING",
    color: COLORS.green,
    blurb: "Puts idle cash to work: daily interest.",
    spots: [d(7, "desk"), d(31, "desk")],
  },
  GYM: {
    name: "Gym",
    sign: "GYM",
    color: COLORS.orange,
    blurb: "Treadmills and weights. Workers burn energy slower.",
    spots: [d(12, "stand"), d(32, "stand"), d(52, "stand", -1)],
  },
  CAFE: {
    name: "Café",
    sign: "CAFE",
    color: COLORS.yellow,
    blurb: "Coffee and snacks. Daily mood boost, quicker breaks.",
    spots: [d(14, "bar"), d(38, "chair"), d(52, "chair", -1)],
  },
  NAP_PODS: {
    name: "Nap Pods",
    sign: "NAP PODS",
    color: COLORS.purple,
    blurb: "Sleeping pods. More places to rest and faster recovery.",
    spots: [d(11, "couch"), d(31, "couch"), d(51, "couch")],
  },
  OFFICE: {
    name: "Open Office",
    sign: "OFFICE",
    color: COLORS.cyan,
    blurb: "More desks: room for 3 more crew and a small output bonus.",
    spots: [d(7, "desk"), d(31, "desk"), d(54, "stand", -1)],
  },
  DATA_CENTER: {
    name: "Data Center",
    sign: "DATA",
    color: COLORS.green,
    blurb: "Extra compute: faster research and a crew-wide output bonus.",
    spots: [d(40, "rack", -1), d(56, "stand", -1)],
  },
  PODCAST_BOOTH: {
    name: "Podcast Booth",
    sign: "PODCAST",
    color: COLORS.red,
    blurb: "Shows and interviews. Boosts Social growth and income.",
    spots: [d(18, "chair"), d(44, "chair", -1)],
  },
  MERCH_STORE: {
    name: "Merch Store",
    sign: "MERCH",
    color: COLORS.pink,
    blurb: "A street-level store front. Boosts Shop sales.",
    spots: [d(20, "stand"), d(46, "stand")],
  },
  EMPTY: {
    name: "Empty slot",
    sign: "BUILD HERE",
    color: "#5a5470",
    blurb: "An empty space. Pick a room to build here.",
    spots: [d(32, "stand")],
  },
};

export function initialBuilding(): BuildingState {
  const rooms: RoomSlot[] = [
    { id: "slot_a", type: "EMPTY", floor: 0, col: 0, locked: true, level: 0 },
    { id: "command", type: "COMMAND", floor: 0, col: 1, locked: false, level: 1 },
    { id: "war_room", type: "WAR_ROOM", floor: 0, col: 2, locked: false, level: 1 },
    { id: "server_room", type: "SERVER_ROOM", floor: 0, col: 3, locked: false, level: 1 },
    { id: "slot_b", type: "EMPTY", floor: 1, col: 0, locked: true, level: 0 },
    { id: "revenue_bay", type: "REVENUE_BAY", floor: 1, col: 1, locked: false, level: 1 },
    { id: "treasury", type: "TREASURY", floor: 1, col: 2, locked: false, level: 1 },
    { id: "marketing_lab", type: "MARKETING_LAB", floor: 1, col: 3, locked: true, level: 0 },
    { id: "slot_c", type: "EMPTY", floor: 2, col: 0, locked: true, level: 0 },
    { id: "factory", type: "FACTORY", floor: 2, col: 1, locked: false, level: 1 },
    { id: "chill", type: "CHILL", floor: 2, col: 2, locked: false, level: 1 },
    { id: "recording_studio", type: "RECORDING_STUDIO", floor: 2, col: 3, locked: true, level: 0 },
  ];
  return { floors: 3, rooms };
}

/** Rooms where tired workers can rest. */
export const REST_ROOM_TYPES: RoomType[] = ["CHILL", "NAP_PODS", "ROOFTOP_LOUNGE", "CAFE"];

// ---------------------------------------------------------------- geometry

export function worldHeight(floors: number): number {
  return ROOF_H + floors * FLOOR_H + SLAB_H + GROUND_H;
}

/** y of the top of a floor's slab. */
export function floorTop(floor: number): number {
  return ROOF_H + floor * FLOOR_H;
}

/** y of the line workers stand on for a floor. */
export function floorBase(floor: number): number {
  return floorTop(floor) + FLOOR_H;
}

/** Vertical band that holds the building from roof sign to street. */
export function buildingBand(floors: number): { y0: number; y1: number } {
  return { y0: floorTop(0) - 50, y1: floorTop(floors) + SLAB_H + 16 };
}

/** Horizontal span of the building. */
export function buildingSpan(): { x0: number; x1: number } {
  return { x0: BUILDING_X - 6, x1: WORLD_W - BUILDING_X + 6 };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function roomRect(slot: Pick<RoomSlot, "floor" | "col">): Rect {
  const c = COLUMNS[slot.col];
  const y = floorTop(slot.floor) + SLAB_H;
  return { x: c.x, y, w: c.w, h: FLOOR_H - SLAB_H };
}

export function shaftRect(floors: number): Rect {
  return { x: SHAFT.x, y: floorTop(0) + SLAB_H, w: SHAFT.w, h: floors * FLOOR_H - SLAB_H };
}

export function spotX(slot: RoomSlot, spotIndex: number): number {
  const spots = ROOM_DEFS[slot.type].spots;
  const spot = spots[Math.max(0, Math.min(spots.length - 1, spotIndex))];
  return roomRect(slot).x + spot.dx;
}

export function findRoom(b: BuildingState, id: string): RoomSlot | undefined {
  return b.rooms.find((r) => r.id === id);
}

export function roomByType(b: BuildingState, type: RoomType): RoomSlot | undefined {
  return b.rooms.find((r) => r.type === type && !r.locked) ?? b.rooms.find((r) => r.type === type);
}

export function roomsOfType(b: BuildingState, type: RoomType): RoomSlot[] {
  return b.rooms.filter((r) => r.type === type && !r.locked);
}

export function roomAt(b: BuildingState, floor: number, x: number): RoomSlot | undefined {
  return b.rooms.find((r) => {
    if (r.floor !== floor) return false;
    const rect = roomRect(r);
    return x >= rect.x && x < rect.x + rect.w;
  });
}

export function hitRoom(b: BuildingState, wx: number, wy: number): RoomSlot | undefined {
  return b.rooms.find((r) => {
    const rect = roomRect(r);
    return wx >= rect.x && wx < rect.x + rect.w && wy >= rect.y && wy < rect.y + rect.h;
  });
}

export function isInShaft(x: number): boolean {
  return x >= SHAFT.x && x < SHAFT.x + SHAFT.w;
}

export const ELEVATOR_X = SHAFT_CENTER_X;
export { WORLD_W };
