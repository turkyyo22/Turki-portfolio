import { google } from "@ai-sdk/google";

import { validateExploreLinesRequest, writeExploreLines } from "@/lib/ai/exploreLines";
import { providerOptionsFor, resolveAdminModelId } from "@/lib/assistant/model";
import {
  guardAdminAiRequest,
  jsonError,
  jsonResponse,
  modelErrorResponse,
  readJsonBody,
  requestDeadline,
} from "@/lib/server/adminAi";

export const maxDuration = 30;

const MAX_BODY_BYTES = 80 * 1024; // 16,000 characters of Arabic plus JSON overhead
const MODEL_DEADLINE_MS = 25_000;

/**
 * Drafts the guide robot's lines about one post's building in Explore mode,
 * in English and Arabic, with Gemini. Nothing is saved here: the dashboard shows
 * the draft to the admin, who edits it and saves it with the post.
 * Admin only: the Gemini key stays on the server and can't be used by anyone else.
 */
export async function POST(request) {
  const guard = await guardAdminAiRequest(request);
  if (!guard.ok) return guard.response;

  const { body, error } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return error;

  const validation = validateExploreLinesRequest(body);
  if (!validation.ok) return jsonError(400, validation.error);

  const modelId = resolveAdminModelId();
  const signal = requestDeadline(request, MODEL_DEADLINE_MS);
  try {
    const lines = await writeExploreLines({
      model: google(modelId),
      post: validation.value.post,
      abortSignal: signal,
      providerOptions: providerOptionsFor(modelId),
    });
    return jsonResponse({ lines });
  } catch (failure) {
    return modelErrorResponse(failure, { label: "explore-lines", signal });
  }
}
