"use client";

import { useEffect, useRef, useState } from "react";

import { ACCENTS, setAccent } from "@/lib/accent";
import { useAccent } from "@/lib/useAccent";

/**
 * The colour button in the navigation bar. It shows the current accent; opening
 * it offers the other colours, and picking one recolours the whole site and is
 * remembered for the visitor's next visit (see src/lib/accent.js).
 * `dict` holds the button's label and a name for each colour.
 */
export default function AccentPicker({ dict }) {
  const accent = useAccent();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={dict.label}
        title={dict.label}
        aria-expanded={isOpen}
        aria-controls="accent-menu"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-cyan/50 bg-glass backdrop-blur-md transition-all duration-200 hover:bg-cyan/15 hover:shadow-[0_0_16px_rgb(var(--accent-cyan-rgb)/0.35)] active:scale-95 sm:h-[34px] sm:w-[34px] ${
          isOpen ? "bg-cyan/15 shadow-[0_0_16px_rgb(var(--accent-cyan-rgb)/0.35)]" : ""
        }`}
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-cyan to-blue shadow-[0_0_8px_rgb(var(--accent-cyan-rgb)/0.8)]" />
      </button>

      {isOpen && (
        <div
          id="accent-menu"
          role="group"
          aria-label={dict.label}
          className="absolute end-0 top-full z-50 mt-3 rounded-xl border border-cyan/20 bg-[#050A15]/95 p-3 shadow-[0_0_24px_rgb(var(--accent-cyan-rgb)/0.18)] backdrop-blur-xl"
        >
          <p className="mb-2.5 whitespace-nowrap text-[10px] font-mono uppercase tracking-widest text-white/60">{dict.label}</p>
          <div className="flex gap-2.5">
            {ACCENTS.map((option) => {
              const isCurrent = option.id === accent;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isCurrent}
                  aria-label={dict[option.id]}
                  title={dict[option.id]}
                  onClick={() => setAccent(option.id)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-[#050A15] transition-transform duration-200 hover:scale-110 active:scale-95 ${
                    isCurrent ? "ring-2 ring-white/90" : ""
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${option.primary}, ${option.secondary})`,
                    boxShadow: `0 0 12px ${option.primary}66`,
                  }}
                >
                  {isCurrent && (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#050a15]" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
