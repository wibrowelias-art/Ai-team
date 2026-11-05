/** Time of day and weather. Pure functions so they can be tested. */
import { MINUTES_PER_DAY } from "@/game/constants";

export type RGB = [number, number, number];

/** Sky keyframes over a day (minute of day → top and bottom colors). */
const SKY: { m: number; top: RGB; bottom: RGB }[] = [
  { m: 0, top: [5, 4, 12], bottom: [29, 18, 48] },
  { m: 300, top: [5, 4, 12], bottom: [29, 18, 48] },
  { m: 390, top: [42, 24, 70], bottom: [214, 96, 120] }, // dawn
  { m: 480, top: [36, 58, 104], bottom: [128, 112, 168] }, // overcast cyber day
  { m: 1020, top: [36, 58, 104], bottom: [128, 112, 168] },
  { m: 1140, top: [52, 22, 72], bottom: [232, 104, 92] }, // dusk
  { m: 1230, top: [5, 4, 12], bottom: [29, 18, 48] },
  { m: 1440, top: [5, 4, 12], bottom: [29, 18, 48] },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}

function minuteOfDay(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function skyColors(minutes: number): { top: RGB; bottom: RGB } {
  const m = minuteOfDay(minutes);
  for (let i = 1; i < SKY.length; i++) {
    const a = SKY[i - 1];
    const b = SKY[i];
    if (m <= b.m) {
      const t = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m);
      return { top: lerpRGB(a.top, b.top, t), bottom: lerpRGB(a.bottom, b.bottom, t) };
    }
  }
  return { top: SKY[0].top, bottom: SKY[0].bottom };
}

/** 1 at night, 0 in full daylight, smooth through dawn (05:00-08:00) and dusk (17:00-20:30). */
export function nightFactor(minutes: number): number {
  const m = minuteOfDay(minutes);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (m < 300) return 1;
  if (m < 480) return 1 - smooth((m - 300) / 180);
  if (m < 1020) return 0;
  if (m < 1230) return smooth((m - 1020) / 210);
  return 1;
}

export type Weather = "clear" | "rain" | "storm" | "fog";

function hash(n: number): number {
  const s = Math.sin(n * 91.345 + 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Weather is fixed per game day so it doesn't flicker between saves and reloads. */
export function weatherFor(day: number): Weather {
  const h = hash(day);
  if (h < 0.22) return "rain";
  if (h < 0.3) return "storm";
  if (h < 0.4) return "fog";
  return "clear";
}

export function rainAmount(w: Weather): number {
  return w === "storm" ? 1 : w === "rain" ? 0.55 : 0;
}

export function rgb(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
