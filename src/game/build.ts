/** Build rooms, add floors, upgrade rooms and buy shop upgrades. */
import { findRoom, ROOM_DEFS } from "./building";
import { draftOf, log, spend } from "./draft";
import type { GameState, RoomSlot, UpgradeId } from "./types";
import { ADD_FLOOR_COST, BUILD_COST, MAX_FLOORS, MAX_ROOM_LEVEL, MAX_UPGRADE_LEVEL, roomUpgradeCost, SHOP_UPGRADES, upgradeCost } from "./upgrades";

export interface BuildResult {
  state: GameState;
  error: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function buildRoom(state: GameState, roomId: string): BuildResult {
  const room = findRoom(state.building, roomId);
  if (!room) return { state, error: "Unknown room." };
  if (!room.locked) return { state, error: "That room is already built." };
  const cost = BUILD_COST[room.type];
  if (cost === undefined) return { state, error: "That room can't be built." };
  if (state.cash < cost) return { state, error: `Building the ${ROOM_DEFS[room.type].name} costs ${money(cost)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", cost);
  s.building = { ...s.building, rooms: s.building.rooms.map((r) => (r.id === roomId ? { ...r, locked: false, level: 1 } : r)) };
  log(s, `🏗️ Built the ${ROOM_DEFS[room.type].name} for ${money(cost)}.`, "good");
  return { state: s, error: null };
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

/** New floors go on top: everything else moves down one floor index. */
export function addFloor(state: GameState): BuildResult {
  if (state.building.floors >= MAX_FLOORS) return { state, error: `The permit allows ${MAX_FLOORS} floors.` };
  if (state.cash < ADD_FLOOR_COST) return { state, error: `A new floor costs ${money(ADD_FLOOR_COST)}.` };
  const s = draftOf(state);
  spend(s, "upgrades", ADD_FLOOR_COST);
  const newRooms: RoomSlot[] = [
    { id: "rooftop_lounge", type: "ROOFTOP_LOUNGE", floor: 0, col: 0, locked: true, level: 0 },
    { id: "trading_desk", type: "TRADING_DESK", floor: 0, col: 1, locked: true, level: 0 },
    { id: "vault", type: "VAULT", floor: 0, col: 2, locked: true, level: 0 },
  ].filter((r) => !s.building.rooms.some((x) => x.id === r.id)) as RoomSlot[];
  s.building = {
    floors: s.building.floors + 1,
    rooms: [...newRooms, ...s.building.rooms.map((r) => ({ ...r, floor: r.floor + 1 }))],
  };
  for (const w of s.workers) {
    w.floor += 1;
    w.route = w.route.map((st) => (st.kind === "ride" ? { ...st, toFloor: st.toFloor + 1 } : st));
  }
  log(s, `🏗️ Added a new top floor for ${money(ADD_FLOOR_COST)}. Three new rooms are ready to build.`, "good");
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
