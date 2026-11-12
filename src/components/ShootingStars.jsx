"use client";

import { useEffect, useRef } from "react";

import { BETWEEN_STARS_MS, FIRST_STAR_MS, launchShootingStar, nextDelay, planShootingStar } from "@/lib/shootingStars";

/**
 * Every 7 to 16 seconds a faint shooting star crosses the page background, in the
 * picked accent colour (see src/lib/shootingStars.js for the timing and sizes).
 * It is small, quick and rare, so like the particle network it is shown to every
 * visitor, including those whose system asks for reduced motion. No stars are
 * launched while the tab is hidden.
 */
export default function ShootingStars() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof layer.animate !== "function") return undefined;

    const launch = () => {
      if (!document.hidden) {
        launchShootingStar(layer, planShootingStar({ width: window.innerWidth, height: window.innerHeight }));
      }
      timer = window.setTimeout(launch, nextDelay(BETWEEN_STARS_MS));
    };
    let timer = window.setTimeout(launch, nextDelay(FIRST_STAR_MS));

    return () => {
      window.clearTimeout(timer);
      layer.replaceChildren();
    };
  }, []);

  // Behind the page content, at the same depth as the particle network.
  return <div ref={layerRef} aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }} />;
}
