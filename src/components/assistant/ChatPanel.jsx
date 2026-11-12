"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import { ASSISTANT_LIMITS } from "@/lib/assistant/limits";
import { directionOf } from "@/lib/i18n";
import ChatMessage from "./ChatMessage";
import CoreBot from "./CoreBot";

export default function ChatPanel({ lang, dict, messages, isLoading, suggestions, suggestionRound, onSend, onClose }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Keep the newest message in view (scrolls the panel, never the page).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, suggestions, isLoading]);

  useEffect(() => {
    // Focus the input on mouse/trackpad devices; on phones that would pop the keyboard up uninvited.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // On phones the chat is full screen, so the page behind it must not scroll.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!text.trim() || isLoading) return;
    onSend(text);
    setText("");
  };

  return (
    <motion.section
      role="dialog"
      aria-label={dict.name}
      dir={directionOf(lang)}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ transformOrigin: "bottom left" }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-[#0b1220] to-[#050a15] sm:inset-auto sm:bottom-6 sm:left-6 sm:h-[min(600px,calc(100dvh-3rem))] sm:w-[390px] sm:rounded-2xl sm:border sm:border-cyan/25 sm:from-[#0b1220]/95 sm:to-[#050a15]/95 sm:shadow-[0_0_30px_rgba(34,211,238,0.15)] sm:backdrop-blur-xl"
    >
      <header className="relative flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan/15 via-blue/10 to-transparent p-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />
        <div className="flex items-center gap-3">
          <CoreBot size={36} />
          <div>
            <h2 className="text-sm font-bold tracking-widest text-white">{dict.name}</h2>
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              {dict.status}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={dict.close} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div
        ref={listRef}
        aria-live="polite"
        aria-busy={isLoading}
        className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {messages.length === 0 && <p className="px-2 pt-2 text-center text-sm leading-relaxed text-muted">{dict.greeting}</p>}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {!isLoading && suggestions.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {suggestions.map((question, index) => (
              <motion.li key={`${suggestionRound}-${question}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}>
                <button
                  type="button"
                  onClick={() => onSend(question)}
                  className="w-full rounded-xl border border-cyan/25 bg-white/[0.03] px-4 py-3 text-center text-xs text-cyan/90 transition-all duration-200 hover:border-cyan hover:bg-cyan hover:font-semibold hover:text-[#050a15] active:scale-[0.98] sm:text-sm"
                >
                  {question}
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 bg-black/30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label htmlFor="assistant-input" className="sr-only">
          {dict.placeholder}
        </label>
        <input
          id="assistant-input"
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={ASSISTANT_LIMITS.maxUserMessageChars}
          placeholder={dict.placeholder}
          autoComplete="off"
          dir="auto"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white transition-all placeholder:text-white/40 focus:border-cyan/60 focus:bg-white/[0.06] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || isLoading}
          aria-label={dict.send}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan to-blue text-[#050a15] shadow-[0_0_14px_rgb(var(--accent-cyan-rgb)/0.3)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </motion.section>
  );
}
