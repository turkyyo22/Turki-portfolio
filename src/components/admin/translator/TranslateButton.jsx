"use client";

/** The ✨ translate button, with a spinner while the AI works. */
export default function TranslateButton({ children, busy = false, disabled = false, onClick, title, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-busy={busy}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan/40 bg-cyan/10 font-semibold text-cyan shadow-[0_0_12px_rgb(var(--accent-cyan-rgb)/0.15)] transition hover:bg-cyan/20 hover:shadow-[0_0_16px_rgb(var(--accent-cyan-rgb)/0.3)] disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {busy ? (
        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
      ) : (
        <span aria-hidden="true">✨</span>
      )}
      {busy ? "Translating…" : children}
    </button>
  );
}
