"use client";

import { useState } from "react";
import { BUSINESSES, BUSINESS_INFO, FOCUS_LABEL, PRODUCT_INFO } from "@/game/business";
import { COLORS, MAX_BUDGET } from "@/game/constants";
import { budgetFactor, demandFactor, hasOutage } from "@/game/economy";
import { MISSIONS } from "@/game/missions";
import { useGame } from "@/game/store";
import { clockOf, dayOf, formatMoney } from "@/game/time";
import type { BusinessId, CostKind, GameState, Product, ProductStage } from "@/game/types";
import BarChart, { REVENUE_COLOR, SPENT_COLOR } from "../BarChart";
import ProductMockup from "../ProductMockup";
import { NeonButton, Section, StatBar } from "../ui";

function Stat({ label, value, color = "text-white", small }: { label: string; value: string; color?: string; small?: string }) {
  return (
    <div className="rounded bg-black/30 p-2">
      <div className="font-pixel text-[13px] text-white/50 uppercase">{label}</div>
      <div className={`font-pixel text-xl leading-tight ${color}`}>{value}</div>
      {small && <div className="text-[10px] text-white/40">{small}</div>}
    </div>
  );
}

function days(g: GameState) {
  return [...g.economy.history, g.economy.today];
}

// ---------------------------------------------------------------- Revenue Bay

export function RevenueContent({ game }: { game: GameState }) {
  const [tab, setTab] = useState<"all" | BusinessId>("all");
  const e = game.economy;
  const history = days(game);
  const avg = e.history.length ? e.history.reduce((a, d) => a + d.revenue, 0) / e.history.length : e.today.revenue;

  return (
    <div data-testid="revenue-content">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total" value={formatMoney(game.totalRevenue, true)} color="text-neon-green" />
        <Stat label="Today" value={formatMoney(e.today.revenue, true)} color="text-neon-green" />
        <Stat label="Avg/day" value={formatMoney(avg, true)} color="text-white" />
      </div>
      {e.investorShare > 0 && (
        <p className="mt-2 text-[11px] text-white/50">Investors take {Math.round(e.investorShare * 100)}% of revenue.</p>
      )}

      <div className="scroll-thin mt-3 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {(["all", ...BUSINESSES] as const).map((b) => {
          const active = tab === b;
          const color = b === "all" ? COLORS.cyan : BUSINESS_INFO[b].color;
          return (
            <button
              key={b}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(b)}
              className="shrink-0 rounded border px-2 py-1 font-pixel text-[15px]"
              style={{ borderColor: active ? color : "rgba(255,255,255,0.12)", color: active ? color : "rgba(255,255,255,0.6)" }}
            >
              {b === "all" ? "All" : `${BUSINESS_INFO[b].icon} ${BUSINESS_INFO[b].name}`}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {tab === "all" ? (
          <BarChart
            title="Last 30 days"
            series={[
              { key: "rev", label: "Revenue", color: REVENUE_COLOR },
              { key: "spent", label: "Spent", color: SPENT_COLOR },
            ]}
            data={history.map((d) => ({ label: `D${d.day}`, values: { rev: d.revenue, spent: d.spent } }))}
          />
        ) : (
          <BusinessTab game={game} business={tab} />
        )}
      </div>
    </div>
  );
}

function BusinessTab({ game, business }: { game: GameState; business: BusinessId }) {
  const e = game.economy;
  const b = e.businesses[business];
  const info = BUSINESS_INFO[business];
  const crew = game.workers.filter((w) => w.focus === business);
  const live = game.products.filter((p) => p.stage === "done" && PRODUCT_INFO[p.type].business === business);
  const extra: Record<BusinessId, [string, string]> = {
    shop: ["Live products", String(live.length)],
    freelance: ["Gig crew", String(crew.length)],
    music: ["Fans", Math.round(b.fans).toLocaleString("en-US")],
    social: ["Followers", Math.round(b.followers).toLocaleString("en-US")],
    research: ["Points", `${Math.floor(b.points)}`],
  };
  return (
    <div>
      <p className="mb-2 text-xs text-white/60">{info.blurb}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Today" value={formatMoney(e.today.byBusiness[business], true)} color="text-neon-green" />
        <Stat label="Total" value={formatMoney(b.totalRevenue, true)} />
        <Stat label={extra[business][0]} value={extra[business][1]} />
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        Crew: {crew.length ? crew.map((w) => w.name).join(", ") : "nobody"}
        {business === "social" && ` · Demand boost ×${demandFactor(b.followers).toFixed(2)} for every business`}
        {business === "research" && ` · Efficiency +${Math.round(b.efficiency * 100)}%`}
      </p>
      <div className="mt-3">
        <BarChart
          title={`${info.name} · last 30 days`}
          series={[{ key: "v", label: info.name, color: REVENUE_COLOR }]}
          data={days(game).map((d) => ({ label: `D${d.day}`, values: { v: d.byBusiness[business] } }))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Treasury

const COST_LABEL: Record<CostKind, string> = {
  salaries: "Salaries",
  rent: "Rent",
  compute: "AI compute",
  budgets: "Dept. budgets",
  bonuses: "Bonuses & tasks",
  events: "Events",
  upgrades: "Building & upgrades",
};

export function TreasuryContent({ game }: { game: GameState }) {
  const setBudget = useGame((s) => s.setBudget);
  const e = game.economy;
  const payroll = game.workers.reduce((a, w) => a + w.salary, 0);
  const totalBudget = BUSINESSES.reduce((a, b) => a + e.budgets[b], 0);
  const budgetLeft = Math.max(0, totalBudget - e.today.costs.budgets);

  return (
    <div data-testid="treasury-content">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Cash" value={formatMoney(game.cash, true)} color={game.cash < 0 ? "text-danger" : "text-hud"} />
        <Stat label="Spent" value={formatMoney(game.totalSpent, true)} color="text-danger" small={`${formatMoney(e.today.spent)} today`} />
        <Stat label="Budget left" value={formatMoney(budgetLeft, true)} small="today" />
      </div>

      <Section title="Spending today">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-pixel text-[15px]">
          {(Object.keys(COST_LABEL) as CostKind[]).map((k) => (
            <li key={k} className="flex justify-between">
              <span className="text-white/60">{COST_LABEL[k]}</span>
              <span className="text-white/90">{formatMoney(e.today.costs[k])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-white/40">Payroll ({formatMoney(payroll)}) and rent are paid at midnight.</p>
      </Section>

      <Section title="Department budgets ($/day)">
        <div className="flex flex-col gap-2">
          {BUSINESSES.map((b) => (
            <label key={b} className="block">
              <div className="flex items-baseline justify-between font-pixel text-[15px]">
                <span style={{ color: BUSINESS_INFO[b].color }}>
                  {BUSINESS_INFO[b].icon} {BUSINESS_INFO[b].name}
                </span>
                <span className="text-white/80">
                  {formatMoney(e.budgets[b])} <span className="text-white/40">· ×{budgetFactor(e.budgets[b]).toFixed(2)}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_BUDGET}
                step={10}
                value={e.budgets[b]}
                onChange={(ev) => setBudget(b, Number(ev.target.value))}
                className="w-full"
                style={{ accentColor: BUSINESS_INFO[b].color }}
                aria-label={`${BUSINESS_INFO[b].name} budget per day`}
                data-testid={`budget-${b}`}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Per worker">
        <table className="w-full font-pixel text-[15px]">
          <thead>
            <tr className="text-[13px] text-white/40">
              <th className="text-left font-normal">Name</th>
              <th className="text-right font-normal">Salary</th>
              <th className="text-right font-normal">Spent</th>
              <th className="text-right font-normal">Earned</th>
            </tr>
          </thead>
          <tbody>
            {game.workers.map((w) => (
              <tr key={w.id} className="border-t border-white/5">
                <td className="py-0.5 text-white">
                  {w.name} <span className="text-[11px] text-white/40">{FOCUS_LABEL[w.focus]}</span>
                </td>
                <td className="text-right text-hud">{formatMoney(w.salary)}</td>
                <td className="text-right text-danger">{formatMoney(w.spent, true)}</td>
                <td className="text-right text-neon-green">{formatMoney(w.earned, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Factory

const COLUMNS: { stage: ProductStage; label: string }[] = [
  { stage: "pending", label: "Pending" },
  { stage: "approval", label: "Approval" },
  { stage: "delivered", label: "Delivered" },
  { stage: "done", label: "Done" },
];

function ProductCard({ p, game }: { p: Product; game: GameState }) {
  const approve = useGame((s) => s.approveProduct);
  const reject = useGame((s) => s.rejectProduct);
  const creator = game.workers.find((w) => w.id === p.creatorId)?.name ?? "ex-crew";
  return (
    <li className="rounded border border-white/10 bg-black/30 p-1.5" data-testid={`product-${p.id}`}>
      <div className="flex gap-1.5">
        <ProductMockup type={p.type} seed={p.seed} size={36} />
        <div className="min-w-0">
          <div className="truncate text-[11px] leading-tight text-white">{p.name}</div>
          <div className="text-[10px] text-white/45">
            {PRODUCT_INFO[p.type].label} · Q{p.quality}
          </div>
          <div className="text-[10px] text-white/45">by {creator}</div>
        </div>
      </div>
      {(p.stage === "pending" || p.stage === "delivered") && (
        <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
          <div className="h-full bg-[#ff9a3c]" style={{ width: `${p.progress}%` }} />
        </div>
      )}
      {p.stage === "approval" && (
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            onClick={() => approve(p.id)}
            className="flex-1 rounded bg-neon-green/20 py-1 font-pixel text-[14px] text-neon-green"
            data-testid="approve"
          >
            ✓ Ship
          </button>
          <button type="button" onClick={() => reject(p.id)} className="rounded bg-danger/15 px-2 py-1 font-pixel text-[14px] text-danger">
            ✕
          </button>
        </div>
      )}
      {p.stage === "done" && <div className="mt-1 text-[10px] text-neon-green">{p.revenue > 0 ? `${formatMoney(p.revenue)} earned` : "Live"}</div>}
    </li>
  );
}

export function FactoryContent({ game }: { game: GameState }) {
  const setAutoApprove = useGame((s) => s.setAutoApprove);
  const approve = useGame((s) => s.approveProduct);
  const waiting = game.products.filter((p) => p.stage === "approval");
  const outage = hasOutage(game);

  return (
    <div data-testid="factory-content">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-pixel text-[15px] text-white/80">
          <input type="checkbox" checked={game.economy.autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="accent-[#ff9a3c]" />
          Auto-approve
        </label>
        {waiting.length > 1 && (
          <NeonButton color={COLORS.green} onClick={() => waiting.forEach((p) => approve(p.id))}>
            Ship all ({waiting.length})
          </NeonButton>
        )}
      </div>
      {outage && <p className="mt-2 rounded bg-danger/15 p-2 text-xs text-danger">⚡ Server outage: production is paused.</p>}
      <p className="mt-1 text-[11px] text-white/45">
        Lines unlocked: {game.economy.unlocked.map((t) => PRODUCT_INFO[t].icon).join(" ")} · Research unlocks more.
      </p>

      <div className="scroll-thin mt-3 -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
        {COLUMNS.map((c) => {
          const items = game.products.filter((p) => p.stage === c.stage);
          const shown = c.stage === "done" ? [...items].reverse().slice(0, 20) : items;
          return (
            <section key={c.stage} className="w-[44%] min-w-[150px] shrink-0 snap-start rounded border border-white/10 bg-black/20 p-1.5">
              <h4 className="mb-1.5 flex justify-between font-pixel text-[14px] text-[#ff9a3c] uppercase">
                {c.label}
                <span className="text-white/50">{items.length}</span>
              </h4>
              <ul className="flex flex-col gap-1.5">
                {shown.map((p) => (
                  <ProductCard key={p.id} p={p} game={game} />
                ))}
                {items.length === 0 && <li className="text-[11px] text-white/30">Empty</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Command / missions

export function CommandContent({ game }: { game: GameState }) {
  const assign = useGame((s) => s.assignMission);
  const free = game.workers.filter((w) => !game.missions.some((m) => m.workerId === w.id && m.status === "active"));
  const [workerId, setWorkerId] = useState(free[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(MISSIONS[0].id);
  const active = game.missions.filter((m) => m.status === "active");
  const finished = game.missions.filter((m) => m.status !== "active").slice(-5).reverse();
  const validWorker = free.some((w) => w.id === workerId) ? workerId : (free[0]?.id ?? "");

  return (
    <div data-testid="command-content">
      <Section title={`Active missions · ${active.length}`}>
        {active.length === 0 && <p className="text-xs text-white/40">No missions running.</p>}
        <ul className="flex flex-col gap-2">
          {active.map((m) => {
            const w = game.workers.find((x) => x.id === m.workerId);
            const left = Math.max(0, m.deadline - game.minutes);
            return (
              <li key={m.id} className="rounded border border-white/10 bg-black/20 p-2">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-white">{m.title}</span>
                  <span className="shrink-0 text-hud">+{formatMoney(m.reward)}</span>
                </div>
                <div className="text-[11px] text-white/50">
                  {w?.name} · {Math.floor(m.progress).toLocaleString("en-US")}/{m.target.toLocaleString("en-US")} · {Math.ceil(left / 60)}h left
                </div>
                <StatBar label="" value={(m.progress / Math.max(1, m.target)) * 100} color={COLORS.cyan} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Assign a mission">
        {free.length === 0 ? (
          <p className="text-xs text-white/40">Everyone is busy.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <select
              value={validWorker}
              onChange={(e) => setWorkerId(e.target.value)}
              className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-pixel text-lg text-white"
              aria-label="Worker"
              data-testid="mission-worker"
            >
              {free.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-pixel text-lg text-white"
              aria-label="Mission"
              data-testid="mission-template"
            >
              {MISSIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · +${m.reward} · {m.days}d
                </option>
              ))}
            </select>
            <NeonButton onClick={() => assign(validWorker, templateId)} testId="mission-assign">
              Assign mission
            </NeonButton>
            <p className="text-[11px] text-white/40">The worker switches to that business and walks to its room.</p>
          </div>
        )}
      </Section>

      {finished.length > 0 && (
        <Section title="Recent">
          <ul className="flex flex-col gap-1 text-xs">
            {finished.map((m) => (
              <li key={m.id} className={m.status === "done" ? "text-neon-green" : "text-danger"}>
                {m.status === "done" ? "✓" : "✕"} {m.title} · {game.workers.find((w) => w.id === m.workerId)?.name ?? "ex-crew"}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function dayClock(minutes: number): string {
  return `D${dayOf(minutes)} ${clockOf(minutes)}`;
}
