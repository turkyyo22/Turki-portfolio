import { google } from "@ai-sdk/google";
import { streamText } from "ai";

import { buildSystemPrompt } from "@/lib/assistant/buildSystemPrompt";
import { classifyModelError, providerOptionsFor, resolveModelId } from "@/lib/assistant/model";
import { validateChatRequest, validateDraftPrompt } from "@/lib/assistant/validateChatRequest";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { getAssistantSettings } from "@/lib/server/assistantSettings";
import { getCvFile, getPosts } from "@/lib/server/content";

export const maxDuration = 30;

const MAX_BODY_BYTES = 64 * 1024;
const perMinute = createRateLimiter({ limit: 10, windowMs: 60_000 });
const perHour = createRateLimiter({ limit: 60, windowMs: 60 * 60_000 });

function jsonError(status, error, headers = {}) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function rateLimited(key) {
  for (const check of [perMinute, perHour]) {
    const result = check(key);
    if (!result.ok) return jsonError(429, "rate_limited", { "Retry-After": String(result.retryAfterSeconds) });
  }
  return null;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: jsonError(413, "body_too_large") };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: jsonError(400, "invalid_json") };
  }
}

async function safely(promise, fallback, label) {
  try {
    return await promise;
  } catch (error) {
    console.error(`[chat] ${label} unavailable:`, error.message);
    return fallback;
  }
}

// The CV goes in as a separate reference turn before the conversation, so the
// model reads the PDF itself without mistaking it for the visitor's question.
// Keeping it first also gives every request the same opening, which the
// model provider can cache.
function withCv(messages, cv) {
  if (!cv) return messages;
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Reference material added by the website, not by the visitor: Turki's CV as a PDF. Don't reply to this; use it only as a source of facts.",
        },
        { type: "file", mediaType: "application/pdf", data: cv.base64, filename: "Turki-CV.pdf" },
      ],
    },
    { role: "assistant", content: "Understood. I'll use Turki's CV only as a source of facts." },
    ...messages,
  ];
}

/**
 * Waits for the first chunk before answering, so failures that happen up front
 * (quota exhausted, bad key) return a real HTTP error instead of an empty 200.
 */
async function streamResponse(textStream) {
  const iterator = textStream[Symbol.asyncIterator]();
  let first;
  try {
    first = await iterator.next();
  } catch (error) {
    console.error("[chat] Model error:", error.message);
    const { status, code } = classifyModelError(error);
    return jsonError(status, code);
  }
  if (first.done) return jsonError(503, "empty_response");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        console.error("[chat] Stream interrupted:", error.message);
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request) {
  const limited = rateLimited(clientKey(request));
  if (limited) return limited;

  const { body, error } = await readJson(request);
  if (error) return error;

  const validation = validateChatRequest(body);
  if (!validation.ok) return jsonError(validation.status, validation.error);

  // The admin "Test" console sends an unpublished prompt. Only the admin may do that,
  // otherwise anyone could turn this endpoint into a general-purpose AI proxy.
  let draftPrompt = null;
  if (body.draftPrompt !== undefined) {
    const auth = await verifyAdminRequest(request);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const draft = validateDraftPrompt(body.draftPrompt);
    if (!draft.ok) return jsonError(draft.status, draft.error);
    draftPrompt = draft.prompt;
  }

  // A draft test uses the toggles from the editor; visitors get the published settings.
  const settings = draftPrompt
    ? { prompt: draftPrompt, includeProjects: body.includeProjects !== false, includeCv: body.includeCv !== false }
    : await getAssistantSettings();
  const { includeProjects, includeCv } = settings;

  const [posts, cv] = await Promise.all([
    includeProjects ? safely(getPosts(), [], "Projects") : [],
    includeCv ? safely(getCvFile(), null, "CV") : null,
  ]);

  const modelId = resolveModelId();
  const result = streamText({
    model: google(modelId),
    system: buildSystemPrompt({
      prompt: settings.prompt,
      posts,
      hasCv: Boolean(cv),
      siteLanguage: validation.siteLanguage,
    }),
    messages: withCv(validation.messages, cv),
    temperature: 0.4,
    maxOutputTokens: 1024,
    maxRetries: 1,
    providerOptions: providerOptionsFor(modelId),
    abortSignal: request.signal,
  });

  return streamResponse(result.textStream);
}
