import { findRoom, ROOM_DEFS, spotX } from "./building";
import { FOCUS_ROOM } from "./business";
import { SAVE_VERSION, START_MINUTE } from "./constants";
import { CREW_SEEDS } from "./crew";
import { newEconomy } from "./economy";
import { starterProducts } from "./products";
import { dayOf } from "./time";
import type { Focus, GameState, Settings, Worker } from "./types";

const DEFAULT_SETTINGS: Settings = { speed: 1, sound: true, scanlines: true, ai: true, graphics: "auto" };

const DB_NAME = "neon-hq";
const STORE = "saves";
const KEY = "slot1";
const LS_KEY = "neon-hq-save-v1";
/** Tiny flag read by an inline script before first paint (see app/layout.tsx). */
const FLAG_KEY = "neon-hq-has-save";

function setFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Basic structural validation so a corrupt or foreign file never crashes the game. */
export function isValidSave(data: unknown): data is GameState {
  if (!data || typeof data !== "object") return false;
  const s = data as Partial<GameState>;
  return (
    typeof s.version === "number" &&
    s.version <= SAVE_VERSION &&
    typeof s.cash === "number" &&
    Number.isFinite(s.cash) &&
    typeof s.minutes === "number" &&
    Array.isArray(s.workers) &&
    s.workers.every((w) => w && typeof w.id === "string" && typeof w.name === "string" && typeof w.x === "number") &&
    !!s.building &&
    Array.isArray(s.building.rooms) &&
    typeof s.building.floors === "number" &&
    !!s.company &&
    typeof s.company.name === "string" &&
    !!s.settings
  );
}

const FOCUS_BY_ROOM: Record<string, Focus> = { factory: "shop", treasury: "freelance", server_room: "music", revenue_bay: "social", command: "research" };

function migrateWorker(w: Worker): Worker {
  const seedFocus = CREW_SEEDS.find((c) => c.id === w.id)?.focus;
  const focus: Focus = w.focus ?? seedFocus ?? FOCUS_BY_ROOM[w.homeRoom] ?? "ops";
  return {
    ...w,
    focus,
    homeRoom: w.focus ? w.homeRoom : FOCUS_ROOM[focus],
    cycleWork: w.cycleWork ?? 0,
    boost: w.boost ?? null,
    lowLoyaltyDays: w.lowLoyaltyDays ?? 0,
    lastTextAt: typeof w.lastTextAt === "number" ? w.lastTextAt : -1e9,
    relationships: w.relationships ?? {},
    memories: Array.isArray(w.memories) ? w.memories.slice(-30) : [],
    // Meetings are not saved; anyone loaded mid-meeting heads back to work.
    ...(w.activity === "meeting" ? { timer: 0 } : {}),
    ...(w.target?.purpose === "meeting" ? { target: { ...w.target, purpose: "visiting" as const } } : {}),
  };
}

/** Upgrade older saves to the current shape. */
export function migrate(input: GameState): GameState {
  const s: GameState = {
    ...input,
    version: SAVE_VERSION,
    log: Array.isArray(input.log) ? input.log : [],
    settings: { ...DEFAULT_SETTINGS, ...(input.settings as Partial<Settings>) },
    workers: input.workers.map(migrateWorker),
    missions: Array.isArray(input.missions) ? input.missions : [],
    pendingEvents: Array.isArray(input.pendingEvents) ? input.pendingEvents : [],
    chats: input.chats && typeof input.chats === "object" ? input.chats : {},
    seq: typeof input.seq === "number" ? input.seq : 0,
    meetings: Array.isArray(input.meetings) ? input.meetings : [],
    upgrades: { coffee: 0, pcs: 0, pool: 0, server_rack: 0, neon_sign: 0, ...((input.upgrades ?? {}) as Partial<GameState["upgrades"]>) },
    candidates: Array.isArray(input.candidates) ? input.candidates : [],
    candidatesDay: typeof input.candidatesDay === "number" ? input.candidatesDay : 0,
    // Players who already have a running company skip the tutorial.
    tutorial: input.tutorial ?? { step: 0, done: input.minutes > START_MINUTE + 120 },
  };
  if (!s.economy || typeof s.economy !== "object") {
    // v1 → v2: the economy arrives.
    s.economy = newEconomy(dayOf(s.minutes));
    const bunc = s.workers.find((w) => w.id === "bunc") ?? s.workers[0];
    s.products = bunc ? starterProducts(s, bunc, Math.random) : [];
    s.economy.launched.tshirt = s.products.length;
  } else {
    s.economy = { ...newEconomy(dayOf(s.minutes)), ...s.economy };
    s.products = Array.isArray(input.products) ? input.products : [];
  }
  // v2 → v3: three rooms per floor become four (a new empty slot on the far left of every floor).
  if ((input.version ?? 1) < 3 && !s.building.rooms.some((r) => r.type === "EMPTY") && s.building.rooms.every((r) => r.col <= 2)) {
    const rooms = s.building.rooms.map((r) => ({ ...r, col: r.col + 1 }));
    for (let f = 0; f < s.building.floors; f++) rooms.push({ id: `slot_m${f}`, type: "EMPTY", floor: f, col: 0, locked: true, level: 0 });
    s.building = { ...s.building, rooms };
    // Room positions moved: put everyone back at their spot.
    s.workers = s.workers.map((w) => {
      const room = (w.target && findRoom(s.building, w.target.roomId)) || findRoom(s.building, w.homeRoom);
      if (!room) return w;
      const spot = Math.min(w.target?.spot ?? 0, ROOM_DEFS[room.type].spots.length - 1);
      const purpose = w.target?.purpose === "meeting" || w.target?.purpose === "walking" ? "visiting" : (w.target?.purpose ?? "working");
      return { ...w, floor: room.floor, x: spotX(room, spot), y: 0, route: [], target: { roomId: room.id, spot, purpose }, activity: purpose, timer: 5 };
    });
  }
  // Ledgers from older saves lack newer cost kinds.
  const blank = newEconomy(1).today.costs;
  s.economy.today = { ...s.economy.today, costs: { ...blank, ...s.economy.today.costs } };
  s.economy.history = s.economy.history.map((d) => ({ ...d, costs: { ...blank, ...d.costs } }));
  return s;
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(text: string): GameState | null {
  try {
    const data: unknown = JSON.parse(text);
    return isValidSave(data) ? migrate(data) : null;
  } catch {
    return null;
  }
}

const OPEN_TIMEOUT_MS = 2000;

/** Open the database; resolves null when IndexedDB is missing, blocked or too slow. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      resolve(db);
    };
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT_MS);
    try {
      if (typeof indexedDB === "undefined") return done(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        clearTimeout(timer);
        const db = req.result;
        // Let other tabs (or a reset) delete/upgrade the database.
        db.onversionchange = () => db.close();
        done(db);
      };
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function idbGet(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        resolve(typeof req.result === "string" ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbSet(value: string | null): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (value === null) store.delete(KEY);
      else store.put(value, KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

function lsGet(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function lsSet(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, value);
  } catch {
    /* storage full or blocked: nothing else to do */
  }
}

/** Save to IndexedDB, falling back to localStorage. */
export async function saveGame(state: GameState): Promise<void> {
  const text = serialize({ ...state, savedAt: Date.now() });
  const ok = await idbSet(text);
  if (!ok) lsSet(text);
  setFlag(true);
}

/** Synchronous save for page unload, where async IndexedDB writes may not finish. */
export function saveGameSync(state: GameState): void {
  lsSet(serialize({ ...state, savedAt: Date.now() }));
  setFlag(true);
}

/** Load the newest valid save from either store. */
export async function loadGame(): Promise<GameState | null> {
  const candidates = [await idbGet(), lsGet()]
    .map((t) => (t ? deserialize(t) : null))
    .filter((s): s is GameState => s !== null)
    .sort((a, b) => b.savedAt - a.savedAt);
  return candidates[0] ?? null;
}

export async function clearSave(): Promise<void> {
  await idbSet(null);
  lsSet(null);
  setFlag(false);
}
