import { ASSISTANT_LIMITS } from "./limits";

const ROLES = new Set(["user", "assistant"]);
const SITE_LANGUAGES = new Set(["en", "ar"]);

const fail = (status, error) => ({ ok: false, status, error });

/**
 * Validates and normalizes a chat request body from the browser.
 * Only `user` and `assistant` messages are accepted: a visitor can never send a
 * `system` message. Old history is dropped instead of rejected, so long chats keep working.
 */
export function validateChatRequest(body, limits = ASSISTANT_LIMITS) {
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return fail(400, "invalid_body");
  }

  const messages = [];
  for (const message of body.messages.slice(-limits.maxMessages)) {
    if (!message || !ROLES.has(message.role) || typeof message.content !== "string") {
      return fail(400, "invalid_message");
    }
    const content = message.content.trim();
    if (!content) continue;
    if (message.role === "user" && content.length > limits.maxUserMessageChars) {
      return fail(413, "message_too_long");
    }
    messages.push({
      role: message.role,
      content: message.role === "assistant" ? content.slice(0, limits.maxAssistantMessageChars) : content,
    });
  }

  // Keep the newest messages within the size budget.
  let total = messages.reduce((sum, message) => sum + message.content.length, 0);
  while (messages.length > 1 && total > limits.maxConversationChars) {
    total -= messages.shift().content.length;
  }
  // The model expects the conversation to start with the visitor.
  while (messages.length && messages[0].role !== "user") messages.shift();

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return fail(400, "last_message_must_be_user");
  }
  const siteLanguage = SITE_LANGUAGES.has(body.lang) ? body.lang : undefined;
  return { ok: true, messages, siteLanguage };
}

/** Validates a draft prompt sent by the admin's "Test" console. */
export function validateDraftPrompt(value, limits = ASSISTANT_LIMITS) {
  if (typeof value !== "string" || !value.trim()) return fail(400, "draft_prompt_required");
  if (value.length > limits.maxPromptChars) return fail(413, "draft_prompt_too_long");
  return { ok: true, prompt: value.trim() };
}
