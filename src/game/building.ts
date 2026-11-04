import { COLORS, COLUMNS, FLOOR_H, GROUND_H, ROOF_H, SHAFT, SHAFT_CENTER_X, SLAB_H, WORLD_W } from "./constants";
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
    spots: [d(12, "desk"), d(34, "desk"), d(56, "desk"), d(46, "stand", -1)],
  },
  WAR_ROOM: {
    name: "War Room",
    sign: "WAR ROOM",
    color: COLORS.red,
    blurb: "Meetings. Call a meeting with a topic and watch the crew argue it out.",
    spots: [d(14, "chair"), d(26, "chair"), d(46, "chair", -1), d(58, "chair", -1), d(36, "stand")],
  },
  REVENUE_BAY: {
    name: "Revenue Bay",
    sign: "REVENUE BAY",
    color: COLORS.green,
    blurb: "Income. Every business, every dollar, and the 30-day chart.",
    spots: [d(14, "desk"), d(40, "desk"), d(60, "stand", -1)],
  },
  TREASURY: {
    name: "Treasury",
    sign: "TREASURY",
    color: COLORS.yellow,
    blurb: "Spending. Salaries, budgets and where the money goes.",
    spots: [d(12, "desk"), d(36, "desk"), d(58, "stand", -1)],
  },
  FACTORY: {
    name: "Factory",
    sign: "FACTORY",
    color: COLORS.orange,
    blurb: "Production. Designs move from Pending to Done on the kanban board.",
    spots: [d(12, "bench"), d(32, "bench"), d(52, "bench"), d(64, "stand", -1)],
  },
  CHILL: {
    name: "Chill / Bar",
    sign: "CHILL BAR",
    color: COLORS.pink,
    blurb: "Break room. Pool table, arcade and a couch. Tired workers recover here.",
    spots: [d(9, "couch"), d(21, "couch"), d(31, "pool"), d(53, "pool", -1), d(60, "arcade")],
  },
  SERVER_ROOM: {
    name: "Server Room",
    sign: "SERVERS",
    color: COLORS.purple,
    blurb: "Racks of humming compute. Better servers make the crew faster.",
    spots: [d(40, "rack"), d(58, "stand", -1)],
  },
  RECORDING_STUDIO: {
    name: "Recording Studio",
    sign: "STUDIO",
    color: COLORS.purple,
    blurb: "Locked. Boosts Music output once built.",
    spots: [d(20, "desk"), d(46, "stand")],
  },
  MARKETING_LAB: {
    name: "Marketing Lab",
    sign: "MARKETING",
    color: COLORS.pink,
    blurb: "Locked. Boosts Social reach once built.",
    spots: [d(20, "desk"), d(46, "desk")],
  },
  VAULT: {
    name: "Vault",
    sign: "VAULT",
    color: COLORS.yellow,
    blurb: "Locked. Protects cash from bad events.",
    spots: [d(30, "stand")],
  },
  ROOFTOP_LOUNGE: {
    name: "Rooftop Lounge",
    sign: "ROOFTOP",
    color: COLORS.cyan,
    blurb: "Locked. Big mood boost for the whole crew.",
    spots: [d(20, "couch"), d(40, "bar")],
  },
  TRADING_DESK: {
    name: "Trading Desk",
    sign: "TRADING",
    color: COLORS.green,
    blurb: "Locked. Put idle cash to work.",
    spots: [d(20, "desk"), d(46, "desk")],
  },
};

export function initialBuilding(): BuildingState {
  const rooms: RoomSlot[] = [
    { id: "command", type: "COMMAND", floor: 0, col: 0, locked: false, level: 1 },
    { id: "war_room", type: "WAR_ROOM", floor: 0, col: 1, locked: false, level: 1 },
    { id: "server_room", type: "SERVER_ROOM", floor: 0, col: 2, locked: false, level: 1 },
    { id: "revenue_bay", type: "REVENUE_BAY", floor: 1, col: 0, locked: false, level: 1 },
    { id: "treasury", type: "TREASURY", floor: 1, col: 1, locked: false, level: 1 },
    { id: "marketing_lab", type: "MARKETING_LAB", floor: 1, col: 2, locked: true, level: 0 },
    { id: "factory", type: "FACTORY", floor: 2, col: 0, locked: false, level: 1 },
    { id: "chill", type: "CHILL", floor: 2, col: 1, locked: false, level: 1 },
    { id: "recording_studio", type: "RECORDING_STUDIO", floor: 2, col: 2, locked: true, level: 0 },
  ];
  return { floors: 3, rooms };
}

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
  return b.rooms.find((r) => r.type === type);
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
