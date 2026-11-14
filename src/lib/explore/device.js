// Decides how Explore mode should start on this device: straight away, after
// asking (phones), or not at all (no 3D support), and at which quality.

const GATE_KEY = "explore-gate";

/**
 * - "unsupported": the browser can't draw the 3D city.
 * - "ask": a phone. The visitor chooses between the lite version, sending the
 *   link to a computer, and going back.
 * - "go": start right away.
 * `quality` is the starting quality: "high", "medium" or "lite". The engine
 * lowers it by itself if the frame rate turns out low.
 */
export function assessDevice({ webgl = false, touchOnly = false, shortSide = 0, memory = 0, cores = 0 } = {}) {
  if (!webgl) return { verdict: "unsupported", quality: "lite" };
  // Phones: touch is the only input and the screen's short side is under 600px (tablets are wider).
  if (touchOnly && shortSide > 0 && shortSide < 600) return { verdict: "ask", quality: "lite" };
  const modest = touchOnly || (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
  return { verdict: "go", quality: modest ? "medium" : "high" };
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
    shortSide: Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight),
    memory: Number(navigator.deviceMemory) || 0,
    cores: Number(navigator.hardwareConcurrency) || 0,
  };
}

/** True when the visitor ticked "Don't show this again" on the phone screen. */
export function gateDismissed() {
  try {
    return localStorage.getItem(GATE_KEY) === "skip";
  } catch {
    return false;
  }
}

export function rememberGateChoice(skip) {
  try {
    if (skip) localStorage.setItem(GATE_KEY, "skip");
    else localStorage.removeItem(GATE_KEY);
  } catch {
    // Storage can be blocked (private windows); the choice then lasts for this visit only.
  }
}
