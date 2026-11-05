"use client";

import { useEffect } from "react";
import { useGame } from "@/game/store";
import type { GameState } from "@/game/types";
import { play, setSoundEnabled, setVolumes, unlockAudio, type Sfx } from "@/lib/sound";

/** Count worker messages across all chats. */
function workerMessages(g: GameState): number {
  let n = 0;
  for (const thread of Object.values(g.chats)) for (const m of thread) if (m.from === "worker") n++;
  return n;
}

/**
 * Turns game changes into sounds: cheers when someone gets paid, a ding when the
 * elevator arrives, a ping for new messages, alerts for events, hammers for building.
 */
export default function SoundDirector() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: false, passive: true });
    window.addEventListener("keydown", unlock);

    let prevMessages = -1;
    const unsub = useGame.subscribe((st, prev) => {
      const g = st.game;
      const p = prev.game;
      if (g?.settings.sound !== p?.settings.sound) setSoundEnabled(g?.settings.sound ?? true);
      if (g && (g.settings.music !== p?.settings.music || g.settings.sfx !== p?.settings.sfx)) setVolumes(g.settings.music, g.settings.sfx);
      if (!g || !p || g === p) return;
      const sounds = new Set<Sfx>();

      // Someone just got paid (bonus or raise).
      for (const w of g.workers) {
        const before = p.workers.find((x) => x.id === w.id);
        if (w.bubble?.icon === "paid" && before?.bubble?.icon !== "paid") {
          sounds.add("coin");
          sounds.add("cheer");
        }
        // The elevator reached a floor.
        if (before && before.route[0]?.kind === "ride" && before.y !== 0 && w.y === 0) sounds.add("ding");
      }

      const msgs = workerMessages(g);
      if (prevMessages >= 0 && msgs > prevMessages) sounds.add("notify");
      prevMessages = msgs;

      if (g.pendingEvents.length > p.pendingEvents.length) sounds.add("alert");
      if (g.workers.length > p.workers.length) sounds.add("door");

      if (g.log.length && g.log !== p.log) {
        const last = g.log[g.log.length - 1];
        if (last !== p.log[p.log.length - 1]) {
          if (/^⬆️/.test(last.text) || /Bought/.test(last.text)) sounds.add("levelup");
          else if (/^🏗️/.test(last.text)) sounds.add("build");
          else if (/is live\.$/.test(last.text) || /Mission complete/.test(last.text)) sounds.add("coin");
        }
      }
      for (const s of sounds) play(s);
    });

    // Errors shown as toasts get a buzz; opening a room panel plays the door.
    const unsubUi = useGame.subscribe((st, prev) => {
      if (st.toasts.length > prev.toasts.length && st.toasts[st.toasts.length - 1]?.kind === "error") play("error");
      if (st.panel?.id === "room" && st.panel !== prev.panel) play("door");
    });

    const st = useGame.getState().game?.settings;
    setVolumes(st?.music ?? 0.5, st?.sfx ?? 0.8);
    setSoundEnabled(st?.sound ?? true);
    return () => {
      unsub();
      unsubUi();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
