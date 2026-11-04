import { FOCUS_ROOM } from "./business";
import { SAVE_VERSION } from "./constants";
import { CREW_SEEDS } from "./crew";
import { newEconomy } from "./economy";
import { starterProducts } from "./products";
import { dayOf } from "./time";
import type { Focus, GameState, Settings, Worker } from "./types";

const DEFAULT_SETTINGS: Settings = { speed: 1, sound: true, scanlines: true, ai: true };

const DB_NAME = "neon-hq";
const STORE = "saves";
const KEY = "slot1";
const LS_KEY = "neon-hq-save-v1";

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
    relationships: w.relationships ?? {},
    memories: w.memories ?? [],
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
}

/** Synchronous save for page unload, where async IndexedDB writes may not finish. */
export function saveGameSync(state: GameState): void {
  lsSet(serialize({ ...state, savedAt: Date.now() }));
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
}
