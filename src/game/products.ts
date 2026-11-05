/** Factory production: products move Pending → Approval → Delivered → Done. */
import { FOCUS_PRODUCTS, PRODUCT_INFO } from "./business";
import { bubble, clamp, log, nextId, say } from "./draft";
import { line } from "./lines";
import type { GameState, Product, ProductType, Worker } from "./types";

type Rng = () => number;

const ADJ = ["Neon", "Midnight", "Chrome", "Glitch", "Pixel", "Cyber", "Velvet", "Static", "Solar", "Hyper", "Lo-fi", "Electric", "Ghost", "Laser", "Retro"];
const NOUN: Record<ProductType, string[]> = {
  tshirt: ["Tiger Tee", "Skyline Tee", "Arcade Tee", "Cat Tee", "Logo Tee", "Wave Tee", "Robot Tee"],
  candle: ["Vanilla Candle", "Rain Candle", "Ozone Candle", "Cedar Candle", "Smoke Candle"],
  poster: ["City Poster", "Grid Poster", "Sunset Poster", "Circuit Poster", "Moon Poster"],
  song: ["Rain", "Overdrive", "Afterhours", "Satellites", "Drift", "Heartbeat", "Night Bus"],
  video: ["Office Tour", "Day in the Life", "Unboxing", "Behind the Scenes", "Hot Take", "Trend Remix"],
};

/** Work per cycle for a fully productive worker; ~9 cycles per product. */
const PRODUCTION_RATE = 12;
const DELIVERY_RATE = 25;
const MAX_WAITING_APPROVAL = 2;
export const MAX_LIVE_PRODUCTS = 40;

export function productName(type: ProductType, seed: number): string {
  const a = ADJ[seed % ADJ.length];
  const n = NOUN[type][Math.floor(seed / ADJ.length) % NOUN[type].length];
  return type === "song" ? `"${a} ${n}"` : `${a} ${n}`;
}

export function makeProduct(s: GameState, type: ProductType, creator: Worker, rng: Rng, stage: Product["stage"] = "pending"): Product {
  const seed = Math.floor(rng() * 1_000_000);
  const quality = clamp(35 + creator.skill * 0.45 + creator.mood * 0.1 + rng() * 20 + s.economy.businesses.research.efficiency * 60, 10, 100);
  return {
    id: nextId(s, "p"),
    type,
    name: productName(type, seed),
    stage,
    progress: 0,
    quality: Math.round(quality),
    seed,
    creatorId: creator.id,
    createdAt: s.minutes,
    liveAt: stage === "done" ? s.minutes : null,
    sales: 0,
    revenue: 0,
  };
}

/** Starter catalog so the shop sells something on day 1. */
export function starterProducts(s: GameState, creator: Worker, rng: Rng): Product[] {
  return [makeProduct(s, "tshirt", creator, rng, "done"), makeProduct(s, "tshirt", creator, rng, "done")].map((p, i) => ({
    ...p,
    name: i === 0 ? "HQ Logo Tee" : "Neon Skyline Tee",
    quality: 60,
  }));
}

function goLive(s: GameState, p: Product): void {
  p.stage = "done";
  p.progress = 100;
  p.liveAt = s.minutes;
  s.economy.launched[p.type] += 1;
  const b = s.economy.businesses;
  if (p.type === "song") b.music.fans += Math.round(250 * (p.quality / 70));
  if (p.type === "video") b.social.followers += Math.round(400 * (p.quality / 70));
  log(s, `${PRODUCT_INFO[p.type].icon} ${p.name} is live.`, "good");
  // Retire the oldest live products when the catalog is full.
  const live = s.products.filter((x) => x.stage === "done");
  if (live.length > MAX_LIVE_PRODUCTS) {
    const retire = new Set(live.slice(0, live.length - MAX_LIVE_PRODUCTS).map((x) => x.id));
    s.products = s.products.filter((x) => !retire.has(x.id));
  }
}

/** Move a product from approval to delivery. Returns false if it is not awaiting approval. */
export function approve(s: GameState, productId: string, rng: Rng): boolean {
  const p = s.products.find((x) => x.id === productId);
  if (!p || p.stage !== "approval") return false;
  p.stage = "delivered";
  p.progress = 0;
  const w = s.workers.find((x) => x.id === p.creatorId);
  if (w) {
    if (w.bubble?.icon === "alert" && !s.products.some((x) => x.creatorId === w.id && x.stage === "approval")) w.bubble = null;
    w.mood = clamp(w.mood + 2);
    // A quick thanks now and then, not after every single approval.
    if (rng() < 0.3 && s.minutes - w.lastTextAt > 60) {
      w.lastTextAt = s.minutes;
      say(s, w.id, line(w.id, "approved", rng));
    }
  }
  return true;
}

export function reject(s: GameState, productId: string, rng: Rng): boolean {
  const p = s.products.find((x) => x.id === productId);
  if (!p || p.stage !== "approval") return false;
  s.products = s.products.filter((x) => x.id !== productId);
  const w = s.workers.find((x) => x.id === p.creatorId);
  if (w) {
    if (!s.products.some((x) => x.creatorId === w.id && x.stage === "approval")) w.bubble = null;
    w.mood = clamp(w.mood - 3);
    say(s, w.id, line(w.id, "rejected", rng));
  }
  return true;
}

/** One cycle of factory work. `outputs` holds each worker's output for the cycle. */
export function runFactory(s: GameState, outputs: Map<string, number>, rng: Rng, opts: { offline: boolean; paused: boolean }): void {
  const autoApprove = s.economy.autoApprove || opts.offline;

  for (const w of s.workers) {
    const lines = FOCUS_PRODUCTS[w.focus];
    if (!lines) continue;
    const types = lines.filter((t) => s.economy.unlocked.includes(t));
    if (types.length === 0) continue;
    const out = outputs.get(w.id) ?? 0;
    // Maverick only builds something now and then.
    if (w.focus === "wild" && rng() > 0.25) continue;

    let current = s.products.find((p) => p.creatorId === w.id && p.stage === "pending");
    if (!current) {
      const waiting = s.products.filter((p) => p.creatorId === w.id && p.stage === "approval").length;
      if (waiting >= MAX_WAITING_APPROVAL || out <= 0) continue;
      current = makeProduct(s, types[Math.floor(rng() * types.length)], w, rng);
      s.products = [...s.products, current];
    }
    if (opts.paused) continue;
    current.progress = Math.min(100, current.progress + out * PRODUCTION_RATE * (w.focus === "wild" ? 2 : 1));
    if (current.progress >= 100) {
      current.progress = 0;
      if (autoApprove) {
        current.stage = "delivered";
      } else {
        current.stage = "approval";
        bubble(w, "alert", s.minutes, 600);
        // One nudge per worker per 3 game hours; the ❗ bubble and the Factory badge carry the rest.
        if (s.minutes - w.lastTextAt > 180) {
          w.lastTextAt = s.minutes;
          say(s, w.id, `${line(w.id, "needsApproval", rng)} (${current.name})`);
        }
      }
    }
  }

  for (const p of s.products) {
    if (p.stage === "approval" && autoApprove) {
      p.stage = "delivered";
      p.progress = 0;
    } else if (p.stage === "delivered" && !opts.paused) {
      p.progress += DELIVERY_RATE;
      if (p.progress >= 100) goLive(s, p);
    }
  }
}
