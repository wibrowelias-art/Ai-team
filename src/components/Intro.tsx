"use client";

import { useState } from "react";
import { THEMES, type ThemeId } from "@/game/constants";
import { useGame } from "@/game/store";
import { play } from "@/lib/sound";
import { T } from "@/ui/tokens";

export default function Intro() {
  const startGame = useGame((s) => s.startGame);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemeId>("pink");
  const trim = THEMES[theme].trim;

  return (
    <main className="relative flex h-full items-center justify-center overflow-y-auto bg-bg px-4 py-8" data-testid="intro" data-intro>
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at top, color-mix(in srgb, ${trim} 16%, transparent), transparent 60%)` }} />
      <div className="scanlines absolute inset-0" />
      <form
        className="panel-surface relative w-full max-w-sm animate-pop rounded-panel p-6"
        style={{ ["--accent" as string]: trim }}
        onSubmit={(e) => {
          e.preventDefault();
          play("levelup");
          startGame(name, theme);
        }}
      >
        <h1 className="animate-flicker text-center font-arcade text-xl leading-relaxed neon-text" style={{ color: trim }}>
          NEON HQ
        </h1>
        <p className="mt-3 text-center text-md text-ink2">You just leased a neon warehouse and hired seven AI workers. Pay them, boss them around, and build an empire.</p>

        <label className="mt-6 block font-pixel text-sm tracking-[0.2em] text-ink2 uppercase" htmlFor="company">
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
          className="mt-2 h-12 w-full rounded-button border border-line bg-raised px-3 font-pixel text-xl text-ink uppercase outline-none focus:border-cyan"
        />

        <fieldset className="mt-5">
          <legend className="font-pixel text-sm tracking-[0.2em] text-ink2 uppercase">Building color</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => {
              const t = THEMES[id];
              const active = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`theme-${id}`}
                  onClick={() => {
                    play("click");
                    setTheme(id);
                  }}
                  aria-pressed={active}
                  className="pressable h-12 rounded-button border font-pixel text-lg uppercase"
                  style={{
                    borderColor: active ? t.trim : T.border,
                    color: active ? T.text : t.trim,
                    background: active ? `color-mix(in srgb, ${t.trim} 28%, ${T.raised})` : T.raised,
                    boxShadow: active ? `0 0 14px -2px ${t.trim}` : undefined,
                    ["--glow" as string]: t.trim,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button type="submit" data-testid="start-game" className="pressable mt-6 h-12 w-full rounded-button font-arcade text-xs tracking-wider text-bg uppercase" style={{ background: trim, boxShadow: `0 0 20px -2px ${trim}`, ["--glow" as string]: trim }}>
          Open the doors
        </button>
      </form>
    </main>
  );
}
