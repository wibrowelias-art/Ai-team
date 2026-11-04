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

export type BusinessId = "shop" | "freelance" | "music" | "social" | "research";
/** What a worker focuses on: a business, operations (boosts everything) or wildcard experiments. */
export type Focus = BusinessId | "ops" | "wild";

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
  // --- economy ---
  focus: Focus;
  /** game minutes spent working during the current cycle */
  cycleWork: number;
  /** temporary output multiplier from a task budget */
  boost: { mult: number; until: number } | null;
  lowLoyaltyDays: number;
}

export type ProductType = "tshirt" | "candle" | "poster" | "song" | "video";
export type ProductStage = "pending" | "approval" | "delivered" | "done";

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  stage: ProductStage;
  /** 0..100 inside the current stage */
  progress: number;
  quality: number;
  seed: number;
  creatorId: string;
  createdAt: number;
  liveAt: number | null;
  sales: number;
  revenue: number;
}

export type CostKind = "salaries" | "rent" | "compute" | "budgets" | "bonuses" | "events";

export interface DayLedger {
  day: number;
  revenue: number;
  spent: number;
  byBusiness: Record<BusinessId, number>;
  costs: Record<CostKind, number>;
}

export interface BusinessState {
  totalRevenue: number;
  /** music fans */
  fans: number;
  /** social followers */
  followers: number;
  /** research points */
  points: number;
  /** extra quality/efficiency from research */
  efficiency: number;
}

export interface Modifier {
  id: string;
  label: string;
  business: BusinessId | "all";
  mult: number;
  /** game minute when it ends; Infinity-like large number for "until fixed" */
  until: number;
  outage?: boolean;
  /** limit a shop modifier to one product */
  productId?: string;
}

export interface Economy {
  businesses: Record<BusinessId, BusinessState>;
  /** department budgets in $ per day */
  budgets: Record<BusinessId, number>;
  today: DayLedger;
  history: DayLedger[];
  modifiers: Modifier[];
  investorShare: number;
  unlocked: ProductType[];
  autoApprove: boolean;
  /** revenue earned during the last finished cycle (for UI feedback) */
  lastCycleRevenue: number;
  /** days in a row payroll left cash negative */
  unpaidDays: number;
  /** cash from outside the businesses (investors, mission rewards) */
  otherIncome: number;
  /** products that have ever gone live, per type */
  launched: Record<ProductType, number>;
}

export interface Mission {
  id: string;
  templateId: string;
  workerId: string;
  title: string;
  start: number;
  target: number;
  progress: number;
  reward: number;
  deadline: number;
  status: "active" | "done" | "failed";
}

export interface EventChoice {
  label: string;
  detail: string;
}

export interface GameEvent {
  id: string;
  kind: "viral" | "refund" | "investor" | "poaching" | "outage" | "drama";
  title: string;
  body: string;
  choices: EventChoice[];
  defaultChoice: number;
  createdAt: number;
  data: Record<string, string | number>;
}

export interface ChatMessage {
  id: string;
  from: "player" | "worker";
  text: string;
  t: number;
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
  economy: Economy;
  products: Product[];
  missions: Mission[];
  pendingEvents: GameEvent[];
  chats: Record<string, ChatMessage[]>;
  /** counter for ids */
  seq: number;
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
