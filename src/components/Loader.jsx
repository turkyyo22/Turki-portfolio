/**
 * Loading indicator: a glowing cyan ring with the T.A Core accent. It keeps
 * spinning with reduced motion too (it's essential feedback, not decoration).
 * `tone="light"` is for white backgrounds such as the CV pages.
 */
export default function Loader({ label, tone = "dark", className = "" }) {
  const light = tone === "light";
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className={`absolute inset-0 rounded-full border-[3px] ${light ? "border-slate-200" : "border-white/10"}`} />
        <span className="loader-spin absolute inset-0 rounded-full border-[3px] border-transparent border-t-cyan border-r-cyan/60 shadow-[0_0_18px_rgba(0,229,255,0.35)]" />
        <span className="loader-pulse h-2.5 w-2.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(0,229,255,0.9)]" />
      </span>
      {label && <span className={`font-mono text-xs ${light ? "text-slate-500" : "text-white/60"}`}>{label}</span>}
    </div>
  );
}
