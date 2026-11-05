/** Server-only Gemini client. Reads GEMINI_API_KEY; the key never leaves the server. */
import type { Prompt } from "@/game/ai/prompts";
import { parseJsonLoose } from "@/game/ai/validate";

export const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
/** Total time budget for one request across both models. */
export const TOTAL_TIMEOUT_MS = 12_000;
/** The primary gets at most this much, so the fallback still has time. */
export const PRIMARY_TIMEOUT_MS = 6_000;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** After the primary is overloaded, go straight to the fallback for this long. */
export const PRIMARY_COOLDOWN_MS = 60_000;
const primaryCooldownUntil = new Map<string, number>();

/** Test helper. */
export function resetModelCooldowns(): void {
  primaryCooldownUntil.clear();
}

export interface GenerateResult {
  json: unknown;
  model: string;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function callModel(model: string, prompt: Prompt, apiKey: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: prompt.contents,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: prompt.temperature,
          maxOutputTokens: prompt.maxOutputTokens,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new GeminiError(`${model} returned HTTP ${res.status}`, res.status);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new GeminiError(`${model} returned no text`);
    const json = parseJsonLoose(text);
    if (json === null) throw new GeminiError(`${model} returned invalid JSON`);
    return json;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    if ((err as Error).name === "AbortError") throw new GeminiError(`${model} timed out`);
    throw new GeminiError(`${model} request failed`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try the primary model, then the fallback, inside a 12 s total budget.
 * `accept` validates the parsed JSON; a result it rejects counts as a failure.
 */
export async function generate<T>(
  prompt: Prompt,
  accept: (json: unknown) => T | null,
  opts: { apiKey?: string; fetchImpl?: typeof fetch; now?: () => number; totalMs?: number; primaryMs?: number } = {},
): Promise<{ data: T; model: string }> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const total = opts.totalMs ?? TOTAL_TIMEOUT_MS;
  const deadline = now() + total;
  const errors: string[] = [];

  const skipPrimary = (primaryCooldownUntil.get(PRIMARY_MODEL) ?? 0) > now();
  const plan: [string, number][] = [
    ...(skipPrimary ? [] : [[PRIMARY_MODEL, opts.primaryMs ?? PRIMARY_TIMEOUT_MS] as [string, number]]),
    [FALLBACK_MODEL, total],
  ];
  for (const [model, cap] of plan) {
    const remaining = deadline - now();
    if (remaining <= 250) break;
    try {
      const json = await callModel(model, prompt, apiKey, Math.min(cap, remaining), fetchImpl);
      const data = accept(json);
      if (data !== null) return { data, model };
      errors.push(`${model} output failed validation`);
    } catch (err) {
      errors.push((err as Error).message);
      // Overloaded or rate-limited: skip the primary for a minute instead of waiting on it every time.
      if (model === PRIMARY_MODEL && err instanceof GeminiError && (err.status === 429 || err.status === 503 || /timed out/.test(err.message))) {
        primaryCooldownUntil.set(PRIMARY_MODEL, now() + PRIMARY_COOLDOWN_MS);
      }
    }
  }
  throw new GeminiError(errors.join("; ") || "No model answered in time");
}
