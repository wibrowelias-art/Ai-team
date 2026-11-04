import type { Speed, ThemeId } from "./constants";

export type RoomType =
  | "COMMAND"
  | "WAR_ROOM"
  | "REVENUE_BAY"
  | "TREASURY"
  | "FACTORY"
  | "CHILL"
  | "SERVER_ROOM"
  | "RECORDING_STUDIO"
  | "MARKETING_LAB"
  | "VAULT"
  | "ROOFTOP_LOUNGE"
  | "TRADING_DESK";

export type SpotKind = "desk" | "chair" | "bench" | "couch" | "pool" | "arcade" | "bar" | "stand" | "rack";

export interface Spot {
  /** x offset from the room's left edge */
  dx: number;
  kind: SpotKind;
  /** facing direction while using the spot */
  face: 1 | -1;
}

export interface RoomSlot {
  id: string;
  type: RoomType;
  floor: number;
  col: number;
  locked: boolean;
  level: number;
}

export interface BuildingState {
  floors: number;
  rooms: RoomSlot[];
}

export type HairStyle = "short" | "long" | "spiky" | "bald" | "mohawk" | "bun";
export type Accessory = "none" | "cap" | "headphones" | "glasses" | "shades" | "skull" | "robot" | "beanie";

export interface WorkerLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: string;
  pants: string;
  accessory: Accessory;
  accent: string;
}

export type RouteStep = { kind: "walk"; x: number } | { kind: "ride"; toFloor: number };

export type Activity = "walking" | "working" | "resting" | "visiting" | "idle";
export type Pose = "idle" | "walk" | "type" | "sleep" | "pool" | "cheer" | "angry";
export type BubbleIcon = "idea" | "tired" | "paid" | "angry" | "alert";

export interface WorkerTarget {
  roomId: string;
  spot: number;
  purpose: Activity;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  personality: string;
  look: WorkerLook;
  salary: number;
  skill: number;
  speed: number;
  mood: number;
  energy: number;
  loyalty: number;
  task: string;
  taskProgress: number;
  homeRoom: string;
  relationships: Record<string, number>;
  memories: string[];
  earned: number;
  spent: number;
  // --- position / behaviour ---
  floor: number;
  x: number;
  /** vertical offset from the floor's standing line while riding the elevator */
  y: number;
  facing: 1 | -1;
  route: RouteStep[];
  activity: Activity;
  target: WorkerTarget | null;
  /** game minutes left in the current activity */
  timer: number;
  bubble: { icon: BubbleIcon; until: number } | null;
}

export interface LogEntry {
  t: number;
  text: string;
  kind: "info" | "good" | "bad" | "system";
}

export interface Settings {
  speed: Speed;
  sound: boolean;
  scanlines: boolean;
  ai: boolean;
}

export interface GameState {
  version: number;
  started: boolean;
  company: { name: string; theme: ThemeId };
  cash: number;
  totalRevenue: number;
  totalSpent: number;
  /** total elapsed game minutes since day 1 00:00 */
  minutes: number;
  cyclesToday: number;
  building: BuildingState;
  workers: Worker[];
  log: LogEntry[];
  settings: Settings;
  savedAt: number;
}
