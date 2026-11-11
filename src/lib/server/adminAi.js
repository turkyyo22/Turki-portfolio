import "server-only";

import { AdminAiError } from "@/lib/ai/errors";
import { classifyModelError } from "@/lib/assistant/model";
import { createRateLimiter } from "@/lib/rateLimit";
import { verifyAdminRequest } from "@/lib/server/adminAuth";

// Shared by every admin AI endpoint (translator, prompt editor), so together
// they can never make more than this many Gemini calls for one admin, even if
// a button gets stuck or a script loops.
const perMinute = createRateLimiter({ limit: 20, windowMs: 60_000 });
const perDay = createRateLimiter({ limit: 300, windowMs: 24 * 60 * 60_000 });

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function jsonError(status, error, headers = {}) {
  return jsonResponse({ error }, status, headers);
}

/**
 * Lets the request through only for the signed-in site admin, within the
 * shared AI budget. Returns `{ ok: true, email }` or `{ ok: false, response }`.
 */
export async function guardAdminAiRequest(request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return { ok: false, response: jsonError(auth.status, auth.error) };

  for (const check of [perMinute, perDay]) {
    const result = check(auth.email);
    if (!result.ok) {
      return { ok: false, response: jsonError(429, "rate_limited", { "Retry-After": String(result.retryAfterSeconds) }) };
    }
  }
  return { ok: true, email: auth.email };
}

/** Parses a JSON body, refusing anything larger than `maxBytes`. */
export async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return { error: jsonError(413, "body_too_large") };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return { error: jsonError(413, "body_too_large") };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: jsonError(400, "invalid_json") };
  }
}

/** Aborts the model call when the admin cancels the request, or after `ms`. */
export function requestDeadline(request, ms) {
  return AbortSignal.any([request.signal, AbortSignal.timeout(ms)]);
}

/** Turns a failed model call into an HTTP error the admin UI understands. */
export function modelErrorResponse(error, { label, signal }) {
  if (error instanceof AdminAiError) {
    console.warn(`[${label}] ${error.code}`);
    return jsonError(502, error.code);
  }
  if (signal?.aborted) {
    const timedOut = signal.reason?.name === "TimeoutError";
    if (timedOut) console.warn(`[${label}] The model took too long.`);
    return jsonError(timedOut ? 504 : 499, timedOut ? "ai_timeout" : "cancelled");
  }
  if (error?.name === "AI_NoObjectGeneratedError" || error?.name === "AI_NoOutputGeneratedError") {
    console.warn(`[${label}] The model returned an unusable answer.`);
    return jsonError(502, "ai_bad_output");
  }
  console.error(`[${label}] Model error:`, error?.message);
  const { status, code } = classifyModelError(error);
  return jsonError(status, code);
}
