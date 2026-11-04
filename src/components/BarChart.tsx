"use client";

import { useState } from "react";
import { formatMoney } from "@/game/time";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface BarDatum {
  label: string;
  values: Record<string, number>;
}

/** Validated (dark surface #16161f) pair for revenue vs spending. */
export const REVENUE_COLOR = "#1fa85a";
export const SPENT_COLOR = "#e83ac8";

const W = 340;
const H = 150;
const PAD = { l: 38, r: 6, t: 8, b: 18 };

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Top-rounded bar anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(2, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Grouped bar chart in SVG: one axis, recessive grid, legend for 2+ series,
 * per-day hover/tap tooltip and a table view.
 */
export default function BarChart({ data, series, title }: { data: BarDatum[]; series: Series[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(1.5, Math.min(10, (slot - 3 - gap * (series.length - 1)) / series.length));
  const y = (v: number) => PAD.t + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, max / 2, max];
  const hovered = hover !== null ? data[hover] : null;

  return (
    <figure className="m-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <figcaption className="font-pixel text-[13px] tracking-widest text-[#8a84b8] uppercase">{title}</figcaption>
        <div className="flex items-center gap-3">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-[11px] text-white/70">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          <button type="button" onClick={() => setTable(!table)} className="text-[11px] text-cyan underline-offset-2 hover:underline">
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {table ? (
        <div className="scroll-thin max-h-48 overflow-y-auto">
          <table className="w-full font-pixel text-[14px]">
            <thead>
              <tr className="text-white/50">
                <th className="text-left font-normal">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.label} className="border-t border-white/5">
                  <td className="text-white/70">{d.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="text-right text-white/90">
                      {formatMoney(d.values[s.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill="rgba(233,230,255,0.5)">
                  {formatMoney(t, true)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = PAD.l + i * slot + (slot - (barW * series.length + gap * (series.length - 1))) / 2;
              return (
                <g key={d.label} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {series.map((s, k) => {
                    const v = d.values[s.key] ?? 0;
                    return <path key={s.key} d={barPath(x0 + k * (barW + gap), y(v), barW, y(0) - y(v))} fill={s.color} />;
                  })}
                  {(i === 0 || i === data.length - 1 || data.length <= 8) && (
                    <text x={PAD.l + i * slot + slot / 2} y={H - 5} textAnchor="middle" fontSize={9} fill="rgba(233,230,255,0.5)">
                      {d.label}
                    </text>
                  )}
                  {/* hit target wider than the marks */}
                  <rect
                    x={PAD.l + i * slot}
                    y={PAD.t}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerDown={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded border border-white/15 bg-ink/95 px-2 py-1 text-[11px] whitespace-nowrap shadow-lg"
              style={{
                left: `${((PAD.l + hover * slot + slot / 2) / W) * 100}%`,
                transform: `translateX(${hover > data.length / 2 ? "-105%" : "5%"})`,
              }}
            >
              <div className="font-pixel text-[13px] text-white/60">{hovered.label}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5 text-white/90">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label} <span className="ml-auto pl-2">{formatMoney(hovered.values[s.key] ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
