// Browser-side client for /api/chat, shared by the public chat and the admin test console.

export class AssistantError extends Error {
  constructor(code, { status, partialText = "" } = {}) {
    super(code);
    this.name = "AssistantError";
    this.code = code;
    this.status = status;
    this.partialText = partialText;
  }
}

/** Only real conversation turns are sent back: error notices stay in the UI. */
export function toApiMessages(messages) {
  return messages
    .filter((message) => !message.isError && message.content?.trim())
    .map(({ role, content }) => ({ role, content }));
}

/**
 * Streams the assistant's reply. `onText` receives the full text so far.
 * `options` carries the admin-only draft fields ({ draftPrompt, includeProjects, includeCv }).
 */
export async function streamAssistantReply({ messages, options, idToken, signal, onText }) {
  let response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ messages: toApiMessages(messages), ...options }),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new AssistantError("network");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new AssistantError(body.error || "server_error", { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText?.(text);
    }
    text += decoder.decode();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new AssistantError("interrupted", { partialText: text });
  }

  if (!text.trim()) throw new AssistantError("empty_response");
  return text;
}
