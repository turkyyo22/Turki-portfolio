// A tiny event channel so any part of the page (project cards, the hero, the
// nav menu) can open the assistant or ask it something, without sharing state.

const ASK_EVENT = "ta-core:ask";

/** Opens the assistant and, when `question` is given, sends it right away. */
export function askAssistant(question, { source = "page" } = {}) {
  if (typeof window === "undefined") return;
  const text = typeof question === "string" ? question.trim() : "";
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question: text, source } }));
}

export function openAssistant() {
  askAssistant("", { source: "open" });
}

/** Subscribes to ask requests. Returns the unsubscribe function. */
export function onAssistantAsk(handler) {
  const listener = (event) => handler(event.detail || {});
  window.addEventListener(ASK_EVENT, listener);
  return () => window.removeEventListener(ASK_EVENT, listener);
}
