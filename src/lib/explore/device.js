// Decides how Explore mode starts on this device: at Low or High quality, or not
// at all when the browser can't draw 3D. Phones are first-class visitors: they
// start straight away at Low. The visitor can switch quality in the city, and
// the choice is remembered.

const QUALITY_KEY = "explore-quality";

/**
 * - "unsupported": the browser can't draw the 3D city.
 * - "go": start right away.
 * `quality` is the starting quality, "low" or "high": Low on phones, tablets and
 * modest computers, High on capable ones. The engine lowers it further by itself
 * if the frame rate turns out low.
 */
export function assessDevice({ webgl = false, touchOnly = false, memory = 0, cores = 0 } = {}) {
  if (!webgl) return { verdict: "unsupported", quality: "low" };
  const modest = touchOnly || (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
  return { verdict: "go", quality: modest ? "low" : "high" };
}

/** True when the browser can create the WebGL 2 context that three.js needs. */
export function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/** Reads what `assessDevice` needs from the browser. */
export function probeDevice() {
  return {
    webgl: hasWebGL(),
    touchOnly: window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    memory: Number(navigator.deviceMemory) || 0,
    cores: Number(navigator.hardwareConcurrency) || 0,
  };
}

/** The quality the visitor chose last time ("low" or "high"), or "" if they never chose. */
export function savedQuality() {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value === "low" || value === "high" ? value : "";
  } catch {
    return "";
  }
}

export function saveQuality(quality) {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Storage can be blocked (private windows); the choice then lasts for this visit only.
  }
}
