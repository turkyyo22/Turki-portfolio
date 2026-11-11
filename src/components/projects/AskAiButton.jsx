"use client";

import { askAssistant } from "@/lib/assistant/events";

/** "✦ Ask AI about this": opens the assistant and sends the question. */
export default function AskAiButton({ question, label, onBeforeAsk, className = "" }) {
  return (
    <button
      type="button"
      onClick={() => {
        onBeforeAsk?.();
        askAssistant(question, { source: "project" });
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs font-bold text-cyan transition-all hover:bg-cyan hover:text-[#050a15] hover:shadow-[0_0_18px_rgba(0,229,255,0.35)] active:scale-95 ${className}`}
    >
      <span aria-hidden="true">✦</span>
      {label}
    </button>
  );
}
