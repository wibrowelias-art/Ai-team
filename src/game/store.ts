"use client";

import { create } from "zustand";
import * as A from "./actions";
import * as B from "./build";
import * as H from "./hiring";
import { GAME_MIN_PER_REAL_SEC, type Speed, type ThemeId } from "./constants";
import { applyOffline, type AwaySummary } from "./offline";
import { clearSave, saveGame } from "./save";
import { newGameState, step } from "./sim";
import type { BusinessId, Focus, GameState, MeetingLine, Settings, UpgradeId } from "./types";

/** Number of tutorial steps (see components/Tutorial.tsx). */
export const TUTORIAL_STEPS = 5;
import type { DecisionOutcome } from "./ai/apply";
import type { MeetingDecision } from "./ai/types";

export type PanelId = "crew" | "treasury" | "factory" | "build" | "log" | "settings" | "room" | "worker" | "revenue" | "chat" | "meeting" | "hire";

/** A meeting in progress (not saved; finished transcripts are kept in the game state). */
export interface LiveMeeting {
  topic: string;
  attendees: string[];
  lines: MeetingLine[];
  /** how many lines have been revealed */
  shown: number;
  decisions: MeetingDecision[];
  outcomes: DecisionOutcome[] | null;
  /** waiting for the model */
  busy: boolean;
  source: "ai" | "script" | null;
  status: "running" | "done";
}

export interface PanelState {
  id: PanelId;
  /** room id or worker id for room/worker panels */
  ref?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "message";
  workerId?: string;
}

interface Store {
  /** null until a save is loaded or a new game is started */
  game: GameState | null;
  loaded: boolean;
  panel: PanelState | null;
  selectedWorkerId: string | null;
  /** world point the camera should fly to (consumed by the canvas) */
  focus: { x: number; y: number; n: number } | null;
  toasts: Toast[];
  away: AwaySummary | null;
  /** workers currently "typing" a reply */
  chatPending: Record<string, boolean>;
  meeting: LiveMeeting | null;

  setLoaded: (game: GameState | null, nowMs?: number) => void;
  startGame: (name: string, theme: ThemeId) => void;
  tick: (realDtSec: number) => void;
  setSpeed: (speed: Speed) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  openPanel: (panel: PanelState | null) => void;
  selectWorker: (id: string | null) => void;
  focusOn: (x: number, y: number) => void;
  replaceGame: (game: GameState) => void;
  resetGame: () => Promise<void>;
  toast: (text: string, kind?: Toast["kind"], workerId?: string) => void;
  dismissToast: (id: number) => void;
  dismissAway: () => void;

  payBonus: (workerId: string, amount: number) => boolean;
  giveRaise: (workerId: string, delta: number) => boolean;
  fundTask: (workerId: string, amount: number) => boolean;
  setFocus: (workerId: string, focus: Focus) => boolean;
  setBudget: (business: BusinessId, perDay: number) => boolean;
  setAutoApprove: (on: boolean) => boolean;
  approveProduct: (id: string) => boolean;
  rejectProduct: (id: string) => boolean;
  assignMission: (workerId: string, templateId: string) => boolean;
  resolveEvent: (eventId: string, choice: number) => boolean;

  buildRoom: (roomId: string) => boolean;
  upgradeRoom: (roomId: string) => boolean;
  addFloor: () => boolean;
  buyUpgrade: (id: UpgradeId) => boolean;
  refreshCandidates: () => void;
  rerollCandidates: () => boolean;
  skipCandidate: (id: string) => void;
  hire: (candidateId: string) => boolean;
  fire: (workerId: string) => boolean;
  /** advance the tutorial past `step` (no-op if it is elsewhere) */
  tutorialDone: (step: number) => void;
  skipTutorial: () => void;
}

let toastSeq = 0;

export const useGame = create<Store>((set, get) => {
  /** Run a pure action and either commit it or show its error. */
  const run = (fn: (g: GameState) => A.ActionResult): boolean => {
    const g = get().game;
    if (!g) return false;
    const r = fn(g);
    if (r.error) {
      get().toast(r.error, "error");
      return false;
    }
    set({ game: r.state });
    return true;
  };

  return {
    game: null,
    loaded: false,
    panel: null,
    selectedWorkerId: null,
    focus: null,
    toasts: [],
    away: null,
    chatPending: {},
    meeting: null,

    setLoaded: (game, nowMs = Date.now()) => {
      if (!game) return set({ game: null, loaded: true });
      const { game: caughtUp, summary } = applyOffline(game, nowMs);
      set({ game: caughtUp, loaded: true, away: summary });
      if (summary) void saveGame(caughtUp);
    },

    startGame: (name, theme) => {
      const game = newGameState(name, theme);
      set({ game });
      void saveGame(game);
    },

    tick: (realDtSec) => {
      const g = get().game;
      if (!g || !g.started || g.settings.speed === 0 || get().away) return;
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
      set({ game: null, panel: null, selectedWorkerId: null, away: null, toasts: [], chatPending: {}, meeting: null });
    },

    toast: (text, kind = "info", workerId) => {
      const t: Toast = { id: ++toastSeq, text, kind, workerId };
      set({ toasts: [...get().toasts.slice(-3), t] });
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    dismissAway: () => set({ away: null }),

    payBonus: (workerId, amount) => run((g) => A.payBonus(g, workerId, amount)),
    giveRaise: (workerId, delta) => run((g) => A.giveRaise(g, workerId, delta)),
    fundTask: (workerId, amount) => run((g) => A.fundTask(g, workerId, amount)),
    setFocus: (workerId, focus) => run((g) => A.setFocus(g, workerId, focus)),
    setBudget: (business, perDay) => run((g) => A.setBudget(g, business, perDay)),
    setAutoApprove: (on) => run((g) => A.setAutoApprove(g, on)),
    approveProduct: (id) => run((g) => A.approveProduct(g, id)),
    rejectProduct: (id) => run((g) => A.rejectProduct(g, id)),
    assignMission: (workerId, templateId) => run((g) => A.assignMission(g, workerId, templateId)),
    resolveEvent: (eventId, choice) => run((g) => A.resolveEvent(g, eventId, choice)),

    buildRoom: (roomId) => run((g) => B.buildRoom(g, roomId)),
    upgradeRoom: (roomId) => run((g) => B.upgradeRoom(g, roomId)),
    addFloor: () => run((g) => B.addFloor(g)),
    buyUpgrade: (id) => run((g) => B.buyUpgrade(g, id)),
    refreshCandidates: () => {
      const g = get().game;
      if (!g) return;
      const next = H.ensureCandidates(g, Math.random);
      if (next !== g) set({ game: next });
    },
    rerollCandidates: () => run((g) => H.rerollCandidates(g, Math.random)),
    skipCandidate: (id) => {
      const g = get().game;
      if (g) set({ game: { ...g, candidates: g.candidates.filter((c) => c.id !== id) } });
    },
    hire: (candidateId) => run((g) => H.hire(g, candidateId, Math.random)),
    fire: (workerId) => {
      const ok = run((g) => H.fire(g, workerId, Math.random));
      if (ok) set({ panel: null, selectedWorkerId: null });
      return ok;
    },
    tutorialDone: (step) => {
      const g = get().game;
      if (!g || g.tutorial.done || g.tutorial.step !== step) return;
      const next = step + 1;
      set({ game: { ...g, tutorial: { step: next, done: next >= TUTORIAL_STEPS } } });
    },
    skipTutorial: () => {
      const g = get().game;
      if (g) set({ game: { ...g, tutorial: { ...g.tutorial, done: true } } });
    },
  };
});
