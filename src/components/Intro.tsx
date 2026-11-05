"use client";

import { useState } from "react";
import { THEMES, type ThemeId } from "@/game/constants";
import { useGame } from "@/game/store";

export default function Intro() {
  const startGame = useGame((s) => s.startGame);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemeId>("pink");
  const trim = THEMES[theme].trim;

  return (
    <main className="relative flex h-full items-center justify-center overflow-y-auto bg-ink px-4 py-8" data-testid="intro" data-intro>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(155,92,255,0.18),transparent_60%)]" />
      <div className="scanlines absolute inset-0" />
      <form
        className="relative w-full max-w-sm rounded-lg border-2 bg-panel/95 p-6"
        style={{ borderColor: trim, boxShadow: `0 0 32px -8px ${trim}` }}
        onSubmit={(e) => {
          e.preventDefault();
          startGame(name, theme);
        }}
      >
        <h1 className="animate-flicker text-center font-arcade text-2xl leading-relaxed neon-text" style={{ color: trim }}>
          NEON HQ
        </h1>
        <p className="mt-3 text-center font-pixel text-lg leading-snug text-white/75">
          You just leased a neon warehouse and hired seven AI workers. Pay them, boss them around, and build an empire.
        </p>

        <label className="mt-6 block font-pixel text-base tracking-wider text-[#8a84b8] uppercase" htmlFor="company">
          Company name
        </label>
        <input
          id="company"
          data-testid="company-name"
          value={name}
          maxLength={18}
          onChange={(e) => setName(e.target.value)}
          placeholder="NEON HQ"
          autoComplete="off"
          className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 font-pixel text-xl text-white uppercase outline-none focus:border-cyan"
        />

        <fieldset className="mt-5">
          <legend className="font-pixel text-base tracking-wider text-[#8a84b8] uppercase">Building color</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => {
              const t = THEMES[id];
              const active = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`theme-${id}`}
                  onClick={() => setTheme(id)}
                  aria-pressed={active}
                  className="rounded border-2 py-3 font-pixel text-lg uppercase"
                  style={{
                    borderColor: active ? t.trim : "rgba(255,255,255,0.12)",
                    color: active ? "#ffffff" : t.trim,
                    boxShadow: active ? `0 0 14px -2px ${t.trim}` : undefined,
                    background: active ? t.trimDark : "transparent",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          type="submit"
          data-testid="start-game"
          className="mt-6 w-full rounded py-3 font-arcade text-xs tracking-wider text-ink uppercase"
          style={{ background: trim, boxShadow: `0 0 20px -2px ${trim}` }}
        >
          Open the doors
        </button>
        <p className="mt-4 text-center text-[11px] text-white/40">NEON HQ is a game. All money and workers are fictional.</p>
      </form>
    </main>
  );
}
