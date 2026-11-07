// Shared limits for the assistant, used by the API, the chat UI and the admin editor.
export const ASSISTANT_LIMITS = Object.freeze({
  maxMessages: 20, // conversation turns sent per request
  maxUserMessageChars: 1000,
  maxAssistantMessageChars: 4000,
  maxConversationChars: 24000,
  maxPromptChars: 40000, // the editable prompt in the admin dashboard
  maxProjectContentChars: 1500, // per project and language, when projects are added to the prompt
});

export const ASSISTANT_SETTINGS_DOC = "settings/assistant";
export const ASSISTANT_HISTORY_DOC = "settings/assistantHistory";
export const ASSISTANT_HISTORY_SIZE = 10;
export const ASSISTANT_TAG = "assistant";
