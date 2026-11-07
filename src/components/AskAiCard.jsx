"use client";

import { useState } from "react";

import CoreGlyph from "@/components/assistant/CoreGlyph";
import { askAssistant } from "@/lib/assistant/events";
import { ASSISTANT_LIMITS } from "@/lib/assistant/limits";

/** Hero card that sends a question straight to the assistant. */
export default function AskAiCard({ dict }) {
  const [question, setQuestion] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    askAssistant(question, { source: "hero" });
    setQuestion("");
  };

  return (
    <div className="relative w-full rounded-2xl border border-cyan/20 bg-glass p-6 sm:p-7 backdrop-blur-xl shadow-[0_0_40px_rgba(0,229,255,0.08)]">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />

      <div className="flex items-center gap-4">
        <CoreGlyph size={52} />
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan">{dict.eyebrow}</p>
          <h2 className="text-xl font-bold text-white">{dict.title}</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted leading-relaxed">{dict.subtitle}</p>

      <form onSubmit={submit} className="mt-5 flex gap-2">
        <label htmlFor="hero-ask" className="sr-only">
          {dict.title}
        </label>
        <input
          id="hero-ask"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={ASSISTANT_LIMITS.maxUserMessageChars}
          placeholder={dict.placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 transition-colors focus:border-cyan/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim()}
          className="shrink-0 rounded-xl bg-gradient-to-br from-cyan to-blue px-5 text-sm font-bold text-[#050a15] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {dict.send}
        </button>
      </form>

      <ul className="mt-4 flex flex-col gap-2">
        {dict.suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => askAssistant(suggestion, { source: "hero" })}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-start text-sm text-white/80 transition-all hover:border-cyan/40 hover:bg-cyan/10 hover:text-cyan active:scale-[0.99]"
            >
              <span aria-hidden="true" className="me-2 text-cyan">
                ›
              </span>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
