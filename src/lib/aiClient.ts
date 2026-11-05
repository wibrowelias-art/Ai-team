"use client";

import type { AiRequest } from "@/game/ai/types";

/** At most 400 AI calls per browser session. */
export const SESSION_LIMIT = 400;
const KEY = "neon-hq-ai-calls";
const CLIENT_TIMEOUT_MS = 14_000;

let memoryCount = 0;

function used(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0") || 0;
  } catch {
    return memoryCount;
  }
}

function bump(): void {
  memoryCount += 1;
  try {
    sessionStorage.setItem(KEY, String(used() + 1));
  } catch {
    /* storage blocked: the in-memory counter still applies */
  }
}

export function aiCallsLeft(): number {
  return Math.max(0, SESSION_LIMIT - used());
}

/**
 * Ask the server for an AI result. Returns null whenever the caller should fall back to a
 * scripted reply: AI off, session limit reached, rate limited, model down, or bad output.
 */
export async function askAi<T>(req: AiRequest, validate: (data: unknown) => T | null, enabled: boolean): Promise<{ data: T; model: string } | null> {
  if (!enabled || used() >= SESSION_LIMIT) return null;
  bump();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    const body = (await res.json()) as { ok: boolean; data?: unknown; model?: string };
    if (!body.ok) return null;
    // Never trust the network: validate again on the client.
    const data = validate(body.data);
    return data === null ? null : { data, model: body.model ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
