"use client";

/**
 * Tiny chiptune sound engine on the Web Audio API. Everything is synthesized,
 * so there are no audio files to download. Audio starts after the first user gesture.
 */
export type Sfx = "coin" | "register" | "notify" | "ding" | "door" | "cheer" | "build" | "alert" | "error" | "click" | "open" | "levelup";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let ambient: { stop: () => void } | null = null;
let enabled = true;
let unlocked = false;
let sfxVol = 0.8;
let musicVol = 0.5;
const lastPlayed = new Map<Sfx, number>();

/** Minimum gap between two plays of the same sound, so busy moments don't turn into noise. */
const THROTTLE_MS: Partial<Record<Sfx, number>> = { ding: 1200, door: 1500, notify: 600, coin: 90, click: 50, open: 150, register: 300 };
/** Ambient pad level at full music volume. */
const PAD_LEVEL = 0.07;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(master);
  }
  return ctx;
}

/** Call from a user gesture (tap, click, key). Browsers block audio until then. */
export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
  if (enabled && musicVol > 0) startAmbient();
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.05);
  if (on && unlocked && musicVol > 0) startAmbient();
  if (!on || musicVol <= 0) stopAmbient();
}

/** Separate music and effects volumes (0..1). */
export function setVolumes(music: number, sfx: number): void {
  musicVol = Math.max(0, Math.min(1, music));
  sfxVol = Math.max(0, Math.min(1, sfx));
  if (!ctx || !musicGain) return;
  if (enabled && unlocked && musicVol > 0) startAmbient();
  if (musicVol <= 0) stopAmbient();
  else if (ambient) musicGain.gain.setTargetAtTime(PAD_LEVEL * musicVol, ctx.currentTime, 0.2);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sfxVol), start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(start: number, dur: number, vol: number, cutoff: number): void {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol * sfxVol;
  src.connect(filter).connect(g).connect(master);
  src.start(start);
}

export function play(sfx: Sfx): void {
  if (!enabled || !unlocked || sfxVol <= 0) return;
  const c = ensure();
  if (!c || c.state !== "running") return;
  const now = performance.now();
  const gap = THROTTLE_MS[sfx] ?? 0;
  if (now - (lastPlayed.get(sfx) ?? -1e9) < gap) return;
  lastPlayed.set(sfx, now);
  // A short trail of what played, for tests and debugging.
  const w = window as unknown as { __neonSfx?: string[] };
  w.__neonSfx = [...(w.__neonSfx ?? []), sfx].slice(-20);
  const t = c.currentTime + 0.01;
  switch (sfx) {
    case "coin":
      tone(988, t, 0.08, "square", 0.12);
      tone(1319, t + 0.07, 0.22, "square", 0.12);
      break;
    case "notify":
      tone(660, t, 0.09, "triangle", 0.18);
      tone(880, t + 0.09, 0.16, "triangle", 0.18);
      break;
    case "ding":
      tone(1047, t, 0.6, "sine", 0.12);
      tone(1568, t, 0.4, "sine", 0.05);
      break;
    case "door":
      noise(t, 0.25, 0.12, 900);
      tone(140, t, 0.12, "triangle", 0.08, 90);
      break;
    case "cheer":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.16, "square", 0.08));
      break;
    case "build":
      for (let i = 0; i < 3; i++) {
        noise(t + i * 0.13, 0.06, 0.25, 2500);
        tone(220, t + i * 0.13, 0.06, "square", 0.06, 110);
      }
      tone(784, t + 0.45, 0.3, "triangle", 0.12);
      break;
    case "alert":
      tone(880, t, 0.12, "square", 0.08);
      tone(660, t + 0.14, 0.12, "square", 0.08);
      tone(880, t + 0.28, 0.18, "square", 0.08);
      break;
    case "error":
      tone(196, t, 0.18, "square", 0.08, 147);
      break;
    case "click":
      tone(1800, t, 0.025, "square", 0.04);
      break;
    case "open":
      tone(520, t, 0.05, "triangle", 0.06, 780);
      break;
    case "register":
      noise(t, 0.05, 0.2, 3000);
      tone(1760, t + 0.04, 0.12, "square", 0.08);
      tone(2217, t + 0.1, 0.25, "square", 0.08);
      break;
    case "levelup":
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.08, 0.3, "triangle", 0.1));
      tone(1568, t + 0.45, 0.6, "sine", 0.08);
      break;
  }
}

/** A low, slowly breathing synth pad. Very quiet on purpose. */
function startAmbient(): void {
  if (ambient || !ctx || !musicGain) return;
  const c = ctx;
  const out = musicGain;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  filter.Q.value = 4;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(out);
  const voices = [55, 82.4, 110, 164.8].flatMap((f) =>
    [-6, 6].map((detune) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(filter);
      o.start();
      return o;
    }),
  );
  lfo.start();
  out.gain.setTargetAtTime(PAD_LEVEL * musicVol, c.currentTime, 2);
  ambient = {
    stop: () => {
      out.gain.setTargetAtTime(0, c.currentTime, 0.3);
      const end = c.currentTime + 1.2;
      voices.forEach((o) => o.stop(end));
      lfo.stop(end);
    },
  };
}

function stopAmbient(): void {
  ambient?.stop();
  ambient = null;
}
