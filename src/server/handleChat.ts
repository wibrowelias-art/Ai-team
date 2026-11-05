/** /api/chat logic, separated from the route file so it can be tested without Next. */
import { chatPrompt, initiatePrompt, meetingPrompt } from "@/game/ai/prompts";
import type { AiResponse } from "@/game/ai/types";
import { LIMITS } from "@/game/ai/types";
import { validateChatResult, validateInitiateResult, validateMeetingResult, validateRequest } from "@/game/ai/validate";
import { generate } from "./gemini";
import { RateLimiter } from "./rateLimit";

/** 30 calls per minute per IP. */
export const limiter = new RateLimiter(30, 60_000);

export interface HandlerDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
}

function json(body: AiResponse<unknown> | { ok: false; reason: string }, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export async function handleChat(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const apiKey = deps.apiKey ?? (process.env.AI_DISABLED === "1" ? "" : process.env.GEMINI_API_KEY);
  // No key (or AI_DISABLED=1 for tests): the client uses scripted replies. Not an error for the player.
  if (!apiKey) return json({ ok: false, reason: "ai-disabled" }, 200);

  const gate = (deps.limiter ?? limiter).hit(clientIp(req));
  if (!gate.allowed) {
    return json({ ok: false, reason: "rate-limited" }, 429, { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) });
  }

  const text = await req.text();
  if (text.length > LIMITS.bodyBytes) return json({ ok: false, reason: "too-large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, reason: "bad-json" }, 400);
  }
  const request = validateRequest(body);
  if (typeof request === "string") return json({ ok: false, reason: request }, 400);

  const opts = { apiKey, fetchImpl: deps.fetchImpl };
  try {
    switch (request.kind) {
      case "chat": {
        const r = await generate(chatPrompt(request), validateChatResult, opts);
        return json({ ok: true, data: r.data, model: r.model });
      }
      case "meeting": {
        const missionIds = request.missions.map((m) => m.id);
        const continuing = request.transcript.length > 0;
        const accept = (j: unknown) => {
          const m = validateMeetingResult(j, request.attendees, missionIds, continuing ? 2 : 6);
          if (!m) return null;
          const speakers = new Set(m.lines.map((l) => l.speaker)).size;
          if (!continuing && speakers < Math.min(3, request.attendees.length)) return null;
          if (!continuing && !m.decisions.some((d) => d.action)) return null;
          return m;
        };
        const r = await generate(meetingPrompt(request), accept, opts);
        return json({ ok: true, data: r.data, model: r.model });
      }
      case "initiate": {
        const r = await generate(initiatePrompt(request), validateInitiateResult, opts);
        return json({ ok: true, data: r.data, model: r.model });
      }
    }
  } catch (err) {
    console.warn("[api/chat] model failed:", (err as Error).message);
    return json({ ok: false, reason: "model-unavailable" }, 503);
  }
}
