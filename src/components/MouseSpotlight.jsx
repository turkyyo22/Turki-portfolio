"use client";

import { useEffect, useRef } from "react";

const SIZE = 700;

/**
 * Soft glow that follows the mouse. It moves a single pre-painted layer with
 * `transform` (handled by the GPU) instead of repainting a full-screen gradient
 * on every mouse move. Skipped on touch screens and for reduced motion.
 */
export default function MouseSpotlight() {
  const ref = useRef(null);

  useEffect(() => {
    const glow = ref.current;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!glow || !finePointer || reduceMotion) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const render = () => {
      frame = 0;
      glow.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;
    };
    const onMove = (event) => {
      x = event.clientX;
      y = event.clientY;
      glow.style.opacity = "1";
      if (!frame) frame = requestAnimationFrame(render);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div
        ref={ref}
        className="absolute left-0 top-0 rounded-full opacity-0 transition-opacity duration-500 will-change-transform"
        style={{
          width: SIZE,
          height: SIZE,
          background: "radial-gradient(circle, rgba(34, 211, 238, 0.05) 0%, transparent 60%)",
        }}
      />
    </div>
  );
}
