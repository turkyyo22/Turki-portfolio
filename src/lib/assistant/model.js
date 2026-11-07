// Model selection for the assistant. Override with the GEMINI_MODEL env var.
export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function resolveModelId(env = process.env) {
  return (env.GEMINI_MODEL || "").trim() || DEFAULT_MODEL_ID;
}

/**
 * Short factual answers don't benefit from "thinking", and it adds seconds of
 * latency, so it is turned off (or set to the lowest level) where the model allows.
 */
export function providerOptionsFor(modelId) {
  if (/^gemini-2\.5-flash/.test(modelId)) {
    return { google: { thinkingConfig: { thinkingBudget: 0 } } };
  }
  if (/^gemini-3(\.\d+)?-flash/.test(modelId)) {
    return { google: { thinkingConfig: { thinkingLevel: "minimal" } } };
  }
  return undefined;
}

/** Maps a provider error to the HTTP status and error code the chat UI understands. */
export function classifyModelError(error) {
  const status = Number(error?.statusCode ?? error?.status ?? error?.lastError?.statusCode);
  const message = String(error?.message || "");
  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
    return { status: 429, code: "ai_busy" };
  }
  return { status: 503, code: "ai_unavailable" };
}
