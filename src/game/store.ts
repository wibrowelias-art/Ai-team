"use client";

import { create } from "zustand";
import { GAME_MIN_PER_REAL_SEC, type Speed, type ThemeId } from "./constants";
import { clearSave, saveGame } from "./save";
import { newGameState, step } from "./sim";
import type { GameState, Settings } from "./types";

export type PanelId = "crew" | "treasury" | "factory" | "build" | "log" | "settings" | "room" | "worker";

export interface PanelState {
  id: PanelId;
  /** room id or worker id for room/worker panels */
  ref?: string;
}

interface Store {
  /** null until a save is loaded or a new game is started */
  game: GameState | null;
  loaded: boolean;
  panel: PanelState | null;
  selectedWorkerId: string | null;
  /** world point the camera should fly to (consumed by the canvas) */
  focus: { x: number; y: number; n: number } | null;

  setLoaded: (game: GameState | null) => void;
  startGame: (name: string, theme: ThemeId) => void;
  tick: (realDtSec: number) => void;
  setSpeed: (speed: Speed) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  openPanel: (panel: PanelState | null) => void;
  selectWorker: (id: string | null) => void;
  focusOn: (x: number, y: number) => void;
  replaceGame: (game: GameState) => void;
  resetGame: () => Promise<void>;
}

export const useGame = create<Store>((set, get) => ({
  game: null,
  loaded: false,
  panel: null,
  selectedWorkerId: null,
  focus: null,

  setLoaded: (game) => set({ game, loaded: true }),

  startGame: (name, theme) => {
    const game = newGameState(name, theme);
    set({ game });
    void saveGame(game);
  },

  tick: (realDtSec) => {
    const g = get().game;
    if (!g || !g.started || g.settings.speed === 0) return;
    const dtMin = realDtSec * GAME_MIN_PER_REAL_SEC * g.settings.speed;
    set({ game: step(g, dtMin) });
  },

  setSpeed: (speed) => {
    const g = get().game;
    if (g) set({ game: { ...g, settings: { ...g.settings, speed } } });
  },

  setSetting: (key, value) => {
    const g = get().game;
    if (g) set({ game: { ...g, settings: { ...g.settings, [key]: value } } });
  },

  openPanel: (panel) => set({ panel, selectedWorkerId: panel?.id === "worker" ? (panel.ref ?? null) : get().selectedWorkerId }),

  selectWorker: (id) => set({ selectedWorkerId: id }),

  focusOn: (x, y) => set({ focus: { x, y, n: (get().focus?.n ?? 0) + 1 } }),

  replaceGame: (game) => {
    set({ game, panel: null, selectedWorkerId: null });
    void saveGame(game);
  },

  resetGame: async () => {
    await clearSave();
    set({ game: null, panel: null, selectedWorkerId: null });
  },
}));
