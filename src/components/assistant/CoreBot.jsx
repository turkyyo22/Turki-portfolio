"use client";

import { useId } from "react";

/**
 * The T.A Core mark: a small robot head with a screen visor and glowing eyes.
 * Drawn as SVG so it stays sharp at any size. With `animated`, the eyes blink
 * and the antenna glows (CSS animations, switched off for reduced motion).
 */
export default function CoreBot({ size = 40, animated = true, floating = false, className = "" }) {
  // Unique gradient ids, since several bots can be on the page at once.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shell = `bot-shell-${id}`;
  const rim = `bot-rim-${id}`;
  const eye = `bot-eye-${id}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 drop-shadow-[0_0_10px_rgba(0,229,255,0.45)] ${floating ? "bot-float" : ""} ${className}`}
    >
      <defs>
        <linearGradient id={shell} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22324f" />
          <stop offset="1" stopColor="#0a1222" />
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00E5FF" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <radialGradient id={eye} cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#F0FEFF" />
          <stop offset="0.45" stopColor="#7DF9FF" />
          <stop offset="1" stopColor="#00B8D9" />
        </radialGradient>
      </defs>

      {/* Antenna */}
      <line x1="32" y1="15" x2="32" y2="8.5" stroke={`url(#${rim})`} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="32" cy="6.5" r="3.6" fill="#00E5FF" className={animated ? "bot-antenna" : ""} />

      {/* Ears */}
      <rect x="4" y="28" width="6" height="12" rx="3" fill={`url(#${rim})`} />
      <rect x="54" y="28" width="6" height="12" rx="3" fill={`url(#${rim})`} />

      {/* Head */}
      <rect x="9" y="15" width="46" height="38" rx="14" fill={`url(#${shell})`} stroke={`url(#${rim})`} strokeWidth="2.2" />

      {/* Visor */}
      <rect x="15" y="23" width="34" height="21" rx="10.5" fill="#03070f" stroke="rgba(0,229,255,0.45)" strokeWidth="1.2" />
      <path d="M19 27.5c2-2.3 5-3 9-3" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" strokeLinecap="round" fill="none" />

      {/* Eyes */}
      <g className={animated ? "bot-eyes" : ""}>
        <rect x="22" y="28.5" width="6.5" height="10" rx="3.25" fill={`url(#${eye})`} />
        <rect x="35.5" y="28.5" width="6.5" height="10" rx="3.25" fill={`url(#${eye})`} />
      </g>
    </svg>
  );
}
