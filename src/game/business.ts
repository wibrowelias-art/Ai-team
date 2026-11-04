import { COLORS } from "./constants";
import type { BusinessId, Focus, ProductType } from "./types";

export const BUSINESSES: BusinessId[] = ["shop", "freelance", "music", "social", "research"];

export const BUSINESS_INFO: Record<BusinessId, { name: string; color: string; icon: string; blurb: string }> = {
  shop: { name: "Shop", color: COLORS.pink, icon: "🛍️", blurb: "Product sales. Needs live designs from the Factory." },
  freelance: { name: "Freelance", color: COLORS.cyan, icon: "💼", blurb: "Gig payouts. Clients sometimes complain or refund." },
  music: { name: "Music", color: COLORS.purple, icon: "🎵", blurb: "Streams grow slowly, then spike on a viral hit." },
  social: { name: "Social", color: COLORS.yellow, icon: "📱", blurb: "Followers raise demand for every other business." },
  research: { name: "Research", color: COLORS.green, icon: "🔬", blurb: "Unlocks new products and efficiency." },
};

export const FOCUS_LABEL: Record<Focus, string> = {
  shop: "Shop",
  freelance: "Freelance",
  music: "Music",
  social: "Social",
  research: "Research",
  ops: "Operations",
  wild: "Experiments",
};

/** Where a worker sits for each focus. */
export const FOCUS_ROOM: Record<Focus, string> = {
  shop: "factory",
  freelance: "treasury",
  music: "server_room",
  social: "revenue_bay",
  research: "command",
  ops: "command",
  wild: "factory",
};

export const PRODUCT_INFO: Record<ProductType, { label: string; business: BusinessId; price: number; icon: string }> = {
  tshirt: { label: "T-shirt", business: "shop", price: 25, icon: "👕" },
  candle: { label: "Candle", business: "shop", price: 18, icon: "🕯️" },
  poster: { label: "Poster", business: "shop", price: 15, icon: "🖼️" },
  song: { label: "Song", business: "music", price: 0, icon: "🎵" },
  video: { label: "Video", business: "social", price: 0, icon: "🎬" },
};

/** Product lines a focus can create in the Factory. */
export const FOCUS_PRODUCTS: Partial<Record<Focus, ProductType[]>> = {
  shop: ["tshirt", "candle", "poster"],
  music: ["song"],
  social: ["video"],
  wild: ["tshirt", "candle", "poster", "song", "video"],
};

/** Research unlocks, in order, every RESEARCH_STEP points. */
export const RESEARCH_STEP = 20;
export const RESEARCH_UNLOCKS: (ProductType | "efficiency")[] = ["candle", "poster", "efficiency", "efficiency", "efficiency"];

export function emptyByBusiness(): Record<BusinessId, number> {
  return { shop: 0, freelance: 0, music: 0, social: 0, research: 0 };
}
