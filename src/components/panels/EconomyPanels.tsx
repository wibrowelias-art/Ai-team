"use client";

import { useState } from "react";
import { BUSINESSES, BUSINESS_INFO, FOCUS_LABEL, PRODUCT_INFO } from "@/game/business";
import { MAX_BUDGET } from "@/game/constants";
import { budgetFactor, demandFactor, hasOutage } from "@/game/economy";
import { MISSIONS } from "@/game/missions";
import { useGame } from "@/game/store";
import { formatMoney } from "@/game/time";
import type { BusinessId, CostKind, GameState, Product, ProductStage, ProductType } from "@/game/types";
import { Icon, type IconName } from "@/ui/icons";
import { T } from "@/ui/tokens";
import BarChart, { REVENUE_COLOR, SPENT_COLOR } from "../BarChart";
import ProductMockup from "../ProductMockup";
import { Button, Chip, Empty, Section, Stat, StatBar } from "../ui";

export const BUSINESS_ICON: Record<BusinessId, IconName> = { shop: "shop", freelance: "briefcase", music: "music", social: "phone", research: "flask" };

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
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={formatMoney(game.totalRevenue, true)} color={T.green} />
        <Stat label="Today" value={formatMoney(e.today.revenue, true)} color={T.green} />
        <Stat label="Avg/day" value={formatMoney(avg, true)} />
      </div>
      {e.investorShare > 0 && <p className="mt-2 text-xs text-ink2">Investors take {Math.round(e.investorShare * 100)}% of revenue.</p>}

      <div className="scroll-thin -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        <Chip role="tab" active={tab === "all"} onClick={() => setTab("all")}>
          All
        </Chip>
        {BUSINESSES.map((b) => (
          <Chip key={b} role="tab" active={tab === b} color={BUSINESS_INFO[b].color} onClick={() => setTab(b)}>
            <Icon name={BUSINESS_ICON[b]} size={12} className="mr-1.5" />
            {BUSINESS_INFO[b].name}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
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
      <p className="mb-3 text-sm text-ink2">{info.blurb}</p>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today" value={formatMoney(e.today.byBusiness[business], true)} color={T.green} />
        <Stat label="Total" value={formatMoney(b.totalRevenue, true)} />
        <Stat label={extra[business][0]} value={extra[business][1]} color={info.color} />
      </div>
      <p className="mt-3 text-sm text-ink2">
        Crew: {crew.length ? crew.map((w) => w.name).join(", ") : "nobody"}
        {business === "social" && ` · demand ×${demandFactor(b.followers).toFixed(2)} for every business`}
        {business === "research" && ` · efficiency +${Math.round(b.efficiency * 100)}%`}
      </p>
      <div className="mt-4">
        <BarChart title={`${info.name} · last 30 days`} series={[{ key: "v", label: info.name, color: REVENUE_COLOR }]} data={days(game).map((d) => ({ label: `D${d.day}`, values: { v: d.byBusiness[business] } }))} />
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

  return (
    <div data-testid="treasury-content">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cash" value={formatMoney(game.cash, true)} color={game.cash < 0 ? T.red : T.yellow} />
        <Stat label="Spent" value={formatMoney(game.totalSpent, true)} color={T.red} small={`${formatMoney(e.today.spent)} today`} />
        <Stat label="Payroll" value={formatMoney(payroll, true)} small="per day, at midnight" />
      </div>

      <Section title="Spending today">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
          {(Object.keys(COST_LABEL) as CostKind[]).map((k) => (
            <li key={k} className="flex justify-between text-sm">
              <span className="text-ink2">{COST_LABEL[k]}</span>
              <span className="font-pixel text-md text-ink">{formatMoney(e.today.costs[k])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink2">
          Budgets so far today: {formatMoney(e.today.costs.budgets)} of {formatMoney(totalBudget)}.
        </p>
      </Section>

      <Section title="Department budgets ($/day)">
        <div className="flex flex-col gap-1">
          {BUSINESSES.map((b) => (
            <label key={b} className="block" style={{ ["--accent" as string]: BUSINESS_INFO[b].color }}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-md" style={{ color: BUSINESS_INFO[b].color }}>
                  <Icon name={BUSINESS_ICON[b]} size={12} />
                  {BUSINESS_INFO[b].name}
                </span>
                <span className="font-pixel text-md text-ink">
                  {formatMoney(e.budgets[b])} <span className="text-ink2">· ×{budgetFactor(e.budgets[b]).toFixed(2)}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_BUDGET}
                step={10}
                value={e.budgets[b]}
                onChange={(ev) => setBudget(b, Number(ev.target.value))}
                className="slider"
                aria-label={`${BUSINESS_INFO[b].name} budget per day`}
                data-testid={`budget-${b}`}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Per worker">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="font-normal">Name</th>
              <th className="text-right font-normal">Salary</th>
              <th className="text-right font-normal">Spent</th>
              <th className="text-right font-normal">Earned</th>
            </tr>
          </thead>
          <tbody>
            {game.workers.map((w) => (
              <tr key={w.id} className="border-t border-line/60">
                <td className="py-1.5 text-sm text-ink">
                  {w.name} <span className="text-xs text-ink2">{FOCUS_LABEL[w.focus]}</span>
                </td>
                <td className="text-right font-pixel text-md text-yellow">{formatMoney(w.salary)}</td>
                <td className="text-right font-pixel text-md text-red">{formatMoney(w.spent, true)}</td>
                <td className="text-right font-pixel text-md text-green">{formatMoney(w.earned, true)}</td>
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
  { stage: "pending", label: "In progress" },
  { stage: "approval", label: "Your call" },
  { stage: "delivered", label: "Shipping" },
  { stage: "done", label: "Live" },
];

const LINES: ProductType[] = ["tshirt", "candle", "poster", "song", "video"];

function ProductCard({ p, game }: { p: Product; game: GameState }) {
  const approve = useGame((s) => s.approveProduct);
  const reject = useGame((s) => s.rejectProduct);
  const creator = game.workers.find((w) => w.id === p.creatorId)?.name ?? "former crew";
  return (
    <li className="rounded-button border border-line bg-raised p-2" data-testid={`product-${p.id}`}>
      <div className="flex gap-2">
        <ProductMockup type={p.type} seed={p.seed} size={40} />
        <div className="min-w-0">
          <div className="truncate text-sm leading-tight text-ink">{p.name}</div>
          <div className="text-xs text-ink2">
            {PRODUCT_INFO[p.type].label} · quality {p.quality}
          </div>
          <div className="text-xs text-ink2">by {creator}</div>
        </div>
      </div>
      {(p.stage === "pending" || p.stage === "delivered") && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface">
          <div className="h-full transition-[width] duration-700" style={{ width: `${p.progress}%`, background: T.orange }} />
        </div>
      )}
      {p.stage === "approval" && (
        <div className="mt-2 flex gap-2">
          <Button variant="primary" color={T.green} icon="check" size="sm" onClick={() => approve(p.id)} testId="approve" full>
            Ship
          </Button>
          <Button variant="danger" size="sm" onClick={() => reject(p.id)} title="Scrap this design">
            <Icon name="close" size={10} />
          </Button>
        </div>
      )}
      {p.stage === "done" && <div className="mt-1 font-pixel text-md text-green">{p.revenue > 0 ? `${formatMoney(p.revenue)} earned` : "Just launched"}</div>}
    </li>
  );
}

export function FactoryContent({ game }: { game: GameState }) {
  const setAutoApprove = useGame((s) => s.setAutoApprove);
  const approve = useGame((s) => s.approveProduct);
  const waiting = game.products.filter((p) => p.stage === "approval");
  const outage = hasOutage(game);
  const unlocked = game.economy.unlocked;

  return (
    <div data-testid="factory-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-md text-ink">
          <input type="checkbox" checked={game.economy.autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="h-5 w-5 accent-[var(--orange)]" />
          Auto-approve designs
        </label>
        {waiting.length > 1 && (
          <Button color={T.green} icon="check" onClick={() => waiting.forEach((p) => approve(p.id))}>
            Ship all ({waiting.length})
          </Button>
        )}
      </div>
      {outage && (
        <p className="mt-3 flex items-center gap-2 rounded-button border border-red/40 bg-red/10 p-3 text-sm text-red">
          <Icon name="bolt" size={12} /> Server outage: production is paused until it is fixed.
        </p>
      )}

      <Section title="Product lines">
        <div className="flex flex-wrap gap-2">
          {LINES.map((t) => {
            const on = unlocked.includes(t);
            return (
              <span key={t} className="inline-flex h-9 items-center gap-1.5 rounded-chip border px-2.5 font-pixel text-md" style={{ borderColor: on ? T.border : T.border, color: on ? T.text : T.muted, background: on ? T.raised : "transparent" }}>
                {!on && <Icon name="lock" size={10} />}
                {PRODUCT_INFO[t].label}
              </span>
            );
          })}
        </div>
        {unlocked.length < LINES.length && <p className="mt-2 text-xs text-ink2">Research unlocks locked lines.</p>}
      </Section>

      <div className="scroll-thin -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {COLUMNS.map((c) => {
          const items = game.products.filter((p) => p.stage === c.stage);
          const shown = c.stage === "done" ? [...items].reverse().slice(0, 20) : items;
          return (
            <section key={c.stage} className="w-[62%] min-w-[180px] shrink-0 snap-start rounded-panel border border-line bg-surface p-2 md:w-[48%]">
              <h4 className="mb-2 flex justify-between font-pixel text-md uppercase" style={{ color: T.orange }}>
                {c.label}
                <span className="text-ink2">{items.length}</span>
              </h4>
              <ul className="stagger flex flex-col gap-2">
                {shown.map((p) => (
                  <ProductCard key={p.id} p={p} game={game} />
                ))}
                {items.length === 0 && (
                  <li>
                    <Empty icon={c.stage === "approval" ? "check" : "factory"} text={EMPTY_COL[c.stage]} />
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_COL: Record<ProductStage, string> = {
  pending: "Nobody is designing. Put a worker on Shop, Music or Social.",
  approval: "Nothing waiting for you.",
  delivered: "Nothing shipping right now.",
  done: "No products live yet. Approve a design to launch it.",
};

// ---------------------------------------------------------------- Command / missions

export function CommandContent({ game }: { game: GameState }) {
  const assign = useGame((s) => s.assignMission);
  const free = game.workers.filter((w) => !game.missions.some((m) => m.workerId === w.id && m.status === "active"));
  const [workerId, setWorkerId] = useState(free[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(MISSIONS[0].id);
  const active = game.missions.filter((m) => m.status === "active");
  const finished = game.missions.filter((m) => m.status !== "active").slice(-5).reverse();
  const validWorker = free.some((w) => w.id === workerId) ? workerId : (free[0]?.id ?? "");
  const select = "h-11 w-full rounded-button border border-line bg-raised px-3 text-md text-ink";

  return (
    <div data-testid="command-content">
      <Section title={`Active missions · ${active.length}`}>
        {active.length === 0 ? (
          <Empty icon="star" text="No missions running. Give someone a goal with a deadline and a cash reward." />
        ) : (
          <ul className="stagger flex flex-col gap-2">
            {active.map((m) => {
              const w = game.workers.find((x) => x.id === m.workerId);
              const left = Math.max(0, m.deadline - game.minutes);
              return (
                <li key={m.id} className="rounded-button border border-line bg-raised p-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-ink">{m.title}</span>
                    <span className="shrink-0 font-pixel text-md text-yellow">+{formatMoney(m.reward)}</span>
                  </div>
                  <div className="text-xs text-ink2">
                    {w?.name} · {Math.floor(m.progress).toLocaleString("en-US")}/{m.target.toLocaleString("en-US")} · {Math.ceil(left / 60)}h left
                  </div>
                  <div className="mt-1">
                    <StatBar label="" value={(m.progress / Math.max(1, m.target)) * 100} color={T.cyan} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Assign a mission">
        {free.length === 0 ? (
          <p className="text-sm text-ink2">Everyone already has a mission.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <select value={validWorker} onChange={(e) => setWorkerId(e.target.value)} className={select} aria-label="Worker" data-testid="mission-worker">
              {free.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={select} aria-label="Mission" data-testid="mission-template">
              {MISSIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · +${m.reward} · {m.days}d
                </option>
              ))}
            </select>
            <Button variant="primary" icon="star" onClick={() => assign(validWorker, templateId)} testId="mission-assign" full>
              Assign mission
            </Button>
            <p className="text-xs text-ink2">The worker switches to that business and walks to its room.</p>
          </div>
        )}
      </Section>

      {finished.length > 0 && (
        <Section title="Recent">
          <ul className="flex flex-col gap-1 text-sm">
            {finished.map((m) => (
              <li key={m.id} className="flex items-center gap-2" style={{ color: m.status === "done" ? T.green : T.red }}>
                <Icon name={m.status === "done" ? "check" : "close"} size={10} />
                <span className="text-ink">{m.title}</span>
                <span className="text-ink2">· {game.workers.find((w) => w.id === m.workerId)?.name ?? "former crew"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
