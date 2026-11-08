"use client";

import { useEffect, useRef } from "react";

// Same light as the original design: a 350px cyan glow that fades out at 80%.
const RADIUS = 350;

/**
 * Soft light that follows the mouse. It moves one pre-painted layer with
 * `transform` (handled by the GPU) instead of repainting a full-screen gradient
 * on every mouse move. It follows the visitor's own cursor, so it stays on with
 * reduced motion; touch input is ignored.
 */
export default function MouseSpotlight() {
  const ref = useRef(null);

  useEffect(() => {
    const glow = ref.current;
    if (!glow) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const render = () => {
      frame = 0;
      glow.style.transform = `translate3d(${x - RADIUS}px, ${y - RADIUS}px, 0)`;
      glow.style.opacity = "1";
    };
    const onMove = (event) => {
      if (event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(render);
    };
    // Fade out when the cursor leaves the window.
    const onOut = (event) => {
      if (!event.relatedTarget) glow.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div
        ref={ref}
        className="absolute left-0 top-0 rounded-full opacity-0 transition-opacity duration-500 will-change-transform"
        style={{
          width: RADIUS * 2,
          height: RADIUS * 2,
          background: "radial-gradient(circle closest-side, rgba(34, 211, 238, 0.03), transparent 80%)",
        }}
      />
    </div>
  );
}
