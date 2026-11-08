"use client";

import { useEffect, useState } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

// The provider requires a stable init function, so it lives at module level.
async function initEngine(engine) {
  await loadSlim(engine);
}

// The original network design: faint white and cyan dots that drift slowly,
// link up when they are close, and reach for the cursor ("grab").
const OPTIONS = {
  fullScreen: { enable: true, zIndex: -1 },
  background: { color: { value: "transparent" } },
  fpsLimit: 60,
  pauseOnBlur: true,
  detectRetina: true,
  interactivity: {
    events: { onHover: { enable: true, mode: "grab" } },
    modes: { grab: { distance: 150, links: { opacity: 0.4 } } },
  },
  particles: {
    // 40 dots for every 800 × 1080 px of screen: the same density as the original design.
    number: { value: 40, density: { enable: true, width: 800, height: 1080 } },
    paint: { fill: { enable: true, color: { value: ["#ffffff", "#00e5ff"] }, opacity: 0.3 } },
    links: { enable: true, color: "#00e5ff", distance: 150, opacity: 0.15, width: 1 },
    move: { enable: true, speed: 0.6, direction: "none", outModes: { default: "bounce" } },
    shape: { type: "circle" },
    size: { value: { min: 1, max: 2 } },
  },
};

/**
 * The interactive network of dots behind the page. It is shown to every
 * visitor, including those whose system asks for reduced motion: the dots are
 * faint and slow, and the movement that stands out follows the visitor's own cursor.
 */
export default function NetworkBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Start once the browser is idle, so the background never delays the content.
    const start = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 600);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;
  return (
    <ParticlesProvider init={initEngine}>
      <Particles id="tsparticles" options={OPTIONS} />
    </ParticlesProvider>
  );
}
