import { google } from "@ai-sdk/google";

import { translateFields, validateTranslateRequest } from "@/lib/ai/translate";
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

const MAX_BODY_BYTES = 96 * 1024; // 20,000 characters of Arabic plus JSON overhead
const MODEL_DEADLINE_MS = 25_000;

/**
 * Translates admin content between English and Arabic with Gemini.
 * Admin only: the Gemini key stays on the server and can't be used by anyone else.
 */
export async function POST(request) {
  const guard = await guardAdminAiRequest(request);
  if (!guard.ok) return guard.response;

  const { body, error } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return error;

  const validation = validateTranslateRequest(body);
  if (!validation.ok) return jsonError(400, validation.error);

  const modelId = resolveAdminModelId();
  const signal = requestDeadline(request, MODEL_DEADLINE_MS);
  try {
    const fields = await translateFields({
      model: google(modelId),
      ...validation.value,
      abortSignal: signal,
      providerOptions: providerOptionsFor(modelId),
    });
    return jsonResponse({ fields });
  } catch (failure) {
    return modelErrorResponse(failure, { label: "translate", signal });
  }
}
