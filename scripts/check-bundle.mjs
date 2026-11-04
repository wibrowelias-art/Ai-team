#!/usr/bin/env node
/**
 * Fails if the Gemini key (or the Gemini endpoint) shows up in client bundles.
 * Run after `next build`: `npm run check:bundle`.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
if (!existsSync(root)) {
  console.error("No build found. Run `npm run build` first.");
  process.exit(1);
}

function readEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const f of [".env.local", ".env.production.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

const key = readEnvKey();
const needles = [
  ...(key ? [{ label: "GEMINI_API_KEY value", value: key }] : []),
  { label: "GEMINI_API_KEY name", value: "GEMINI_API_KEY" },
  { label: "Gemini endpoint", value: "generativelanguage.googleapis.com" },
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

let count = 0;
const hits = [];
for (const file of files(root)) {
  count++;
  const text = readFileSync(file, "utf8");
  for (const n of needles) if (text.includes(n.value)) hits.push(`${n.label} in ${file}`);
}

if (hits.length) {
  console.error("Secret leak check FAILED:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log(`Secret leak check passed: ${count} client files scanned${key ? " (including the real key)" : ""}.`);
