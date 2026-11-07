// The T.A Core mark drawn with CSS only. Used where a live 3D scene would be
// overkill (buttons, headers) and as the fallback when WebGL is unavailable.
export default function CoreGlyph({ size = 40, animated = true, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <span className={`absolute inset-0 rounded-full bg-cyan/25 blur-md ${animated ? "animate-pulse" : ""}`} />
      <span className="absolute inset-[10%] rounded-full border border-cyan/40" />
      <span className="absolute inset-[22%] rounded-full border border-blue/40 rotate-45 scale-y-50" />
      <span className="relative h-[46%] w-[46%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#e6fdff_0%,#00E5FF_35%,#3B82F6_75%,#1e3a8a_100%)] shadow-[0_0_18px_rgba(0,229,255,0.7)]" />
    </span>
  );
}
