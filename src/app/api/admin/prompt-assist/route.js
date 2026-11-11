import { google } from "@ai-sdk/google";

import { reasoningOptionsFor, resolveAdminModelId } from "@/lib/assistant/model";
import { planPromptEdit, validatePromptAssistRequest } from "@/lib/assistant/promptAssist";
import {
  guardAdminAiRequest,
  jsonError,
  jsonResponse,
  modelErrorResponse,
  readJsonBody,
  requestDeadline,
} from "@/lib/server/adminAi";

export const maxDuration = 45;

const MAX_BODY_BYTES = 200 * 1024; // a 40,000-character Arabic prompt plus the note
const MODEL_DEADLINE_MS = 35_000;

/**
 * Suggests where and how to add a note to the assistant prompt. Returns an
 * edit plan for one section; the dashboard previews it and applies it to the
 * draft only when the admin approves. Admin only.
 */
export async function POST(request) {
  const guard = await guardAdminAiRequest(request);
  if (!guard.ok) return guard.response;

  const { body, error } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return error;

  const validation = validatePromptAssistRequest(body);
  if (!validation.ok) return jsonError(400, validation.error);

  const modelId = resolveAdminModelId();
  const signal = requestDeadline(request, MODEL_DEADLINE_MS);
  try {
    const plan = await planPromptEdit({
      model: google(modelId),
      request: validation.value,
      abortSignal: signal,
      providerOptions: reasoningOptionsFor(modelId),
    });
    return jsonResponse({ plan });
  } catch (failure) {
    return modelErrorResponse(failure, { label: "prompt-assist", signal });
  }
}
