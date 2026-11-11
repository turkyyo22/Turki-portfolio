"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";

import CoreBot from "./CoreBot";

// three.js is only downloaded when the intro actually plays.
const CoreBot3D = dynamic(() => import("./CoreBot3D"), { ssr: false });

const VISIBLE_MS = 9000;
const SCROLL_DISMISS_PX = 240;
const TYPE_INTERVAL_MS = 28;

/**
 * The first-visit greeting: the 3D T.A Core robot appears above the chat
 * button and "speaks" a short message. Clicking it opens the chat; it dismisses itself
 * after a few seconds, on scroll, or with Escape.
 */
export default function AssistantIntro({ dict, textDirection = "ltr", onOpen, onDismiss }) {
  const reduceMotion = useReducedMotion();
  const fullText = dict.introBubble;
  const [typedLength, setTypedLength] = useState(reduceMotion ? fullText.length : 0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [botSize] = useState(() => (window.innerWidth < 640 ? 96 : 124));
  const handleUnsupported = useCallback(() => setWebglFailed(true), []);
  const isTyping = typedLength < fullText.length;

  useEffect(() => {
    if (!isTyping) return undefined;
    const id = window.setInterval(() => setTypedLength((length) => Math.min(fullText.length, length + 1)), TYPE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isTyping, fullText.length]);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > SCROLL_DISMISS_PX) onDismiss();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.15, x: -16, y: 90, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 240, damping: 20 }}
      style={{ transformOrigin: "bottom left" }}
      // The chat button sits bottom-left in both languages, so the orb must stay on
      // the left of the bubble even on the Arabic site; the bubble keeps its own direction.
      dir="ltr"
      className="fixed bottom-[4.5rem] left-3 z-50 flex sm:bottom-24 max-w-[calc(100vw-1.5rem)] items-end gap-2 sm:left-5"
    >
      <button type="button" onClick={onOpen} aria-label={dict.open} className="relative shrink-0 rounded-full">
        <span className="absolute inset-[18%] rounded-full bg-cyan/20 blur-2xl" aria-hidden="true" />
        {/* With reduced motion the 3D robot is still shown, as a single still frame. */}
        {webglFailed ? (
          <span className="flex items-center justify-center" style={{ width: botSize, height: botSize }}>
            <CoreBot size={botSize * 0.72} />
          </span>
        ) : (
          <CoreBot3D size={botSize} speaking={isTyping} still={Boolean(reduceMotion)} onUnsupported={handleUnsupported} />
        )}
      </button>

      <div
        dir={textDirection}
        className="relative mb-6 w-[min(17rem,calc(100vw-8.5rem))] rounded-2xl rounded-bl-sm border border-cyan/30 bg-[#0b1220]/95 p-4 shadow-[0_0_30px_rgba(0,229,255,0.2)] backdrop-blur-xl"
      >
        <p className="sr-only" role="status">
          {fullText}
        </p>
        <p aria-hidden="true" className="min-h-[3.75rem] text-sm leading-relaxed text-white/90" dir="auto">
          {fullText.slice(0, typedLength)}
          {isTyping && <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-cyan" />}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg bg-gradient-to-br from-cyan to-blue px-3 py-1.5 text-xs font-bold text-[#050a15] transition-all hover:brightness-110 active:scale-95"
          >
            ✦ {dict.introCta}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-2 py-1.5 text-xs text-white/60 transition-colors hover:text-white"
          >
            {dict.introDismiss}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
