"use client";

import { useState } from "react";
import Link from "next/link";

import CoreBot from "@/components/assistant/CoreBot";
import { rememberGateChoice } from "@/lib/explore/device";

/**
 * Shown on phones before the 3D city loads. It is a choice, not a wall: the
 * visitor can try the lite version here, send the link to a computer, or go
 * back to the portfolio. "Don't show this again" is saved in their browser.
 */
export default function DeviceGate({ lang, dict, onAccept }) {
  const [remember, setRemember] = useState(false);
  const [copied, setCopied] = useState(false);

  const accept = () => {
    rememberGateChoice(remember);
    onAccept(remember);
  };

  // Opens the phone's share sheet (so the link can go to WhatsApp, email or
  // notes), or copies the link where sharing isn't available.
  const share = async () => {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: dict.shareTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The visitor closed the share sheet, or copying is blocked: nothing to do.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="explore-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-deep bg-[radial-gradient(circle_at_50%_0%,rgb(var(--accent-blue-rgb)/0.22),transparent_60%)] p-5"
    >
      <div className="w-full max-w-sm rounded-3xl border border-cyan/20 bg-glass p-6 text-center shadow-[0_0_40px_rgb(var(--accent-cyan-rgb)/0.12)] backdrop-blur-xl">
        <div className="flex justify-center">
          <CoreBot size={68} floating />
        </div>
        <h1 id="explore-gate-title" className="mt-4 text-xl font-bold leading-snug text-white">
          {dict.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{dict.text}</p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-gradient-to-br from-cyan to-blue px-6 py-3 text-sm font-bold text-[#050a15] shadow-[0_0_24px_rgb(var(--accent-cyan-rgb)/0.3)] transition-all hover:brightness-110 active:scale-95"
          >
            {dict.lite}
          </button>
          <button
            type="button"
            onClick={share}
            className="rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition-all hover:border-cyan/50 hover:text-cyan active:scale-95"
          >
            <span aria-live="polite">{copied ? dict.copied : dict.share}</span>
          </button>
          <Link href={`/${lang}`} className="rounded-lg px-6 py-3 text-sm font-semibold text-white/60 transition-colors hover:text-cyan">
            {dict.back}
          </Link>
        </div>

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[var(--accent-cyan)]" />
          {dict.remember}
        </label>
      </div>
    </div>
  );
}
