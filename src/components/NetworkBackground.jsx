"use client";

import { useEffect, useState } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

// The provider requires a stable init function, so it lives at module level.
async function initEngine(engine) {
  await loadSlim(engine);
}

function buildOptions(isSmallScreen) {
  return {
    fullScreen: { enable: true, zIndex: -1 },
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
    detectRetina: true,
    interactivity: {
      events: { onHover: { enable: !isSmallScreen, mode: "grab" } },
      modes: { grab: { distance: 150, links: { opacity: 0.4 } } },
    },
    particles: {
      number: { value: isSmallScreen ? 18 : 40, density: { enable: true } },
      paint: { fill: { enable: true, color: { value: ["#ffffff", "#00e5ff"] }, opacity: 0.3 } },
      links: { enable: true, color: "#00e5ff", distance: 150, opacity: 0.15, width: 1 },
      move: { enable: true, speed: 0.6, direction: "none", outModes: { default: "bounce" } },
      shape: { type: "circle" },
      size: { value: { min: 1, max: 2 } },
    },
  };
}

/** Decorative network of particles behind the page. */
export default function NetworkBackground() {
  const [options, setOptions] = useState(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    // Start once the browser is idle, so the background never delays the content.
    const start = () => setOptions(buildOptions(window.innerWidth < 768));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 1200);
    return () => window.clearTimeout(id);
  }, []);

  if (!options) return null;
  return (
    <ParticlesProvider init={initEngine}>
      <Particles id="tsparticles" options={options} />
    </ParticlesProvider>
  );
}
