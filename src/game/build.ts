/** Build rooms, add floors, upgrade rooms and buy shop upgrades. */
import { findRoom, ROOM_DEFS } from "./building";
import { COLS } from "./constants";
import { draftOf, log, nextId, spend } from "./draft";
import type { GameState, RoomSlot, RoomType, UpgradeId } from "./types";
import {
  addFloorCost,
  BUILD_COST,
  CATALOG,
  MAX_FLOORS,
  MAX_ROOM_LEVEL,
  MAX_UPGRADE_LEVEL,
  roomUpgradeCost,
  SHOP_UPGRADES,
  UNIQUE_ROOMS,
  upgradeCost,
} from "./upgrades";

export interface BuildResult {
  state: GameState;
  error: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Build a room. Pre-typed locked slots (e.g. the Marketing Lab) take their own type;
 * empty slots need the type to build, chosen from the catalog.
 */
export function buildRoom(state: GameState, roomId: string, type?: RoomType): BuildResult {
  const room = findRoom(state.building, roomId);
  if (!room) return { state, error: "Unknown room." };
  if (!room.locked) return { state, error: "That room is already built." };
  const target: RoomType | undefined = room.type === "EMPTY" ? type : room.type;
  if (!target || target === "EMPTY") return { state, error: "Pick what to build here." };
  if (room.type === "EMPTY" && !CATALOG.includes(target)) return { state, error: "That room can't be built here." };
  if (room.type !== "EMPTY" && type && type !== room.type) return { state, error: "This slot is reserved." };
  // Unique rooms: one per building, counting a reserved (still locked) slot of that type too.
  if (UNIQUE_ROOMS.includes(target) && state.building.rooms.some((r) => r.type === target && r.id !== roomId)) {
    return { state, error: `You already have a ${ROOM_DEFS[target].name} (or a reserved spot for one).` };
  }
  const cost = BUILD_COST[target];
  if (cost === undefined) return { state, error: "That room can't be built." };
  if (state.cash < cost) return { state, error: `Building the ${ROOM_DEFS[target].name} costs ${money(cost)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", cost);
  s.building = {
    ...s.building,
    rooms: s.building.rooms.map((r) => (r.id === roomId ? { ...r, type: target, locked: false, level: 1 } : r)),
  };
  log(s, `🏗️ Built the ${ROOM_DEFS[target].name} for ${money(cost)}.`, "good");
  return { state: s, error: null };
}

/** Room types that can go in a slot right now (for the build menu). */
export function buildOptions(state: GameState, roomId: string): RoomType[] {
  const room = findRoom(state.building, roomId);
  if (!room || !room.locked) return [];
  if (room.type !== "EMPTY") return [room.type];
  return CATALOG.filter((t) => !(UNIQUE_ROOMS.includes(t) && state.building.rooms.some((r) => r.type === t)));
}

export function upgradeRoom(state: GameState, roomId: string): BuildResult {
  const room = findRoom(state.building, roomId);
  if (!room || room.locked) return { state, error: "Build the room first." };
  if (room.level >= MAX_ROOM_LEVEL) return { state, error: "Already at max level." };
  const cost = roomUpgradeCost(room.level);
  if (state.cash < cost) return { state, error: `Level ${room.level + 1} costs ${money(cost)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", cost);
  s.building = { ...s.building, rooms: s.building.rooms.map((r) => (r.id === roomId ? { ...r, level: r.level + 1 } : r)) };
  log(s, `⬆️ ${ROOM_DEFS[room.type].name} upgraded to level ${room.level + 1}.`, "good");
  return { state: s, error: null };
}

/** New floors go on top with four empty slots: everything else moves down one floor index. */
export function addFloor(state: GameState): BuildResult {
  if (state.building.floors >= MAX_FLOORS) return { state, error: `The permit allows ${MAX_FLOORS} floors.` };
  const cost = addFloorCost(state.building.floors);
  if (state.cash < cost) return { state, error: `A new floor costs ${money(cost)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", cost);
  const newRooms: RoomSlot[] = Array.from({ length: COLS }, (_, col) => ({
    id: nextId(s, "slot"),
    type: "EMPTY" as const,
    floor: 0,
    col,
    locked: true,
    level: 0,
  }));
  s.building = {
    floors: s.building.floors + 1,
    rooms: [...newRooms, ...s.building.rooms.map((r) => ({ ...r, floor: r.floor + 1 }))],
  };
  for (const w of s.workers) {
    w.floor += 1;
    w.route = w.route.map((st) => (st.kind === "ride" ? { ...st, toFloor: st.toFloor + 1 } : st));
  }
  log(s, `🏗️ Added floor ${s.building.floors} for ${money(cost)}. Four new slots are ready to build.`, "good");
  return { state: s, error: null };
}

export function buyUpgrade(state: GameState, id: UpgradeId): BuildResult {
  const def = SHOP_UPGRADES[id];
  if (!def) return { state, error: "Unknown upgrade." };
  const lvl = state.upgrades[id] ?? 0;
  if (lvl >= MAX_UPGRADE_LEVEL) return { state, error: `${def.name} is maxed out.` };
  const cost = upgradeCost(id, lvl)!;
  if (state.cash < cost) return { state, error: `${def.name} level ${lvl + 1} costs ${money(cost)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", cost);
  s.upgrades = { ...s.upgrades, [id]: lvl + 1 };
  log(s, `${def.icon} Bought ${def.name} level ${lvl + 1}.`, "good");
  return { state: s, error: null };
}
