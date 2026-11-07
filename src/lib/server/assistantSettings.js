import "server-only";

import { getDocument } from "@/lib/firestore/rest";
import { DEFAULT_PROMPT } from "@/lib/assistant/defaultPrompt";
import { ASSISTANT_LIMITS, ASSISTANT_SETTINGS_DOC, ASSISTANT_TAG } from "@/lib/assistant/limits";

// Cached briefly, and invalidated right away when the admin publishes.
const SETTINGS_CACHE = { revalidate: 60, tags: [ASSISTANT_TAG] };

export const DEFAULT_ASSISTANT_SETTINGS = Object.freeze({
  prompt: DEFAULT_PROMPT,
  includeProjects: true,
  includeCv: true,
  version: 0,
  source: "default",
});

/** The live assistant settings. Falls back to the built-in prompt if Firestore is unreachable. */
export async function getAssistantSettings() {
  try {
    const stored = await getDocument(ASSISTANT_SETTINGS_DOC, { cache: SETTINGS_CACHE });
    const prompt = typeof stored?.prompt === "string" ? stored.prompt.trim() : "";
    if (!prompt) return DEFAULT_ASSISTANT_SETTINGS;
    return {
      prompt: prompt.slice(0, ASSISTANT_LIMITS.maxPromptChars),
      includeProjects: stored.includeProjects !== false,
      includeCv: stored.includeCv !== false,
      version: Number(stored.version) || 0,
      source: "admin",
    };
  } catch (error) {
    console.error("[assistant] Using the default prompt:", error.message);
    return DEFAULT_ASSISTANT_SETTINGS;
  }
}
