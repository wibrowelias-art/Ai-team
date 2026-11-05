"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import type { GameState } from "@/game/types";

/**
 * The game state changes every frame. Panels only need a few updates per second,
 * so they poll a snapshot instead of re-rendering at 60 fps.
 */
export function usePolledGame(ms = 250): GameState | null {
  const [snap, setSnap] = useState<GameState | null>(() => useGame.getState().game);
  useEffect(() => {
    const id = window.setInterval(() => setSnap(useGame.getState().game), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return snap;
}
