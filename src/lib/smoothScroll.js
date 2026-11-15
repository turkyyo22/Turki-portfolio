const INTERRUPT_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"];

let activeScroll = null;

export function clearHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  const state = window.history.state;
  const data = state && typeof state === "object" ? { ...state, __NA: true } : { __NA: true };
  window.history.replaceState(data, "", `${window.location.pathname}${window.location.search}`);
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const currentY = () => window.scrollY || document.documentElement.scrollTop || 0;

const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

const clampY = (y) => Math.min(maxY(), Math.max(0, y));

// Longer jumps take a little longer, but every jump stays quick.
const durationFor = (distance) => Math.min(900, Math.max(380, 250 + Math.sqrt(distance) * 12));

// Animates the window scroll with requestAnimationFrame. `getTarget` is re-read
// every frame so the scroll still lands correctly if content above the target
// shifts (lazy images, entrance animations) mid-flight. Resolves true when the
// scroll finishes, false when it is interrupted by the user or a newer scroll.
function animateScroll(getTarget) {
  activeScroll?.cancel();
  clearHash();

  const startY = currentY();
  const initialTarget = clampY(getTarget());
  const distance = Math.abs(initialTarget - startY);

  if (distance < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo({ top: initialTarget, behavior: "instant" });
    return Promise.resolve(true);
  }

  const duration = durationFor(distance);

  return new Promise((resolve) => {
    let frame = 0;
    let startTime = null;

    const finish = (completed) => {
      window.cancelAnimationFrame(frame);
      INTERRUPT_EVENTS.forEach((type) => window.removeEventListener(type, interrupt));
      if (activeScroll === handle) activeScroll = null;
      resolve(completed);
    };
    const interrupt = () => finish(false);
    const handle = { cancel: interrupt };

    const step = (now) => {
      if (startTime === null) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      const target = clampY(getTarget());
      window.scrollTo({ top: startY + (target - startY) * easeInOutCubic(progress), behavior: "instant" });
      if (progress < 1) frame = window.requestAnimationFrame(step);
      else finish(true);
    };

    activeScroll = handle;
    INTERRUPT_EVENTS.forEach((type) => window.addEventListener(type, interrupt, { passive: true }));
    frame = window.requestAnimationFrame(step);
  });
}

// For a page opened with a #hash (a project link from Explore mode, or an old
// shared link). The browser jumps to the target once, but the page keeps shifting
// for a moment while content loads (the CV preview, images), which can push the
// target out of view. This keeps the target in place until `duration` ms have
// passed, or until the visitor scrolls, taps or types. Returns a function that
// stops it early.
export function holdHashTarget(duration = 2500) {
  let target = null;
  try {
    const id = decodeURIComponent(window.location.hash.slice(1));
    target = id ? document.getElementById(id) : null;
  } catch {
    // A malformed hash names no element.
  }
  if (!target) return () => {};

  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const startedAt = performance.now();
  let frame = 0;

  const stop = () => {
    window.cancelAnimationFrame(frame);
    INTERRUPT_EVENTS.forEach((type) => window.removeEventListener(type, stop));
  };
  const step = (now) => {
    const wanted = clampY(target.getBoundingClientRect().top + currentY() - margin);
    if (Math.abs(wanted - currentY()) > 2) window.scrollTo({ top: wanted, behavior: "instant" });
    if (now - startedAt < duration) frame = window.requestAnimationFrame(step);
    else stop();
  };

  INTERRUPT_EVENTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  frame = window.requestAnimationFrame(step);
  return stop;
}

export function scrollToY(targetY) {
  return animateScroll(() => targetY);
}

export function scrollToId(id, fallbackId) {
  const target = document.getElementById(id) || (fallbackId ? document.getElementById(fallbackId) : null);
  if (!target) return Promise.resolve(false);

  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  return animateScroll(() => target.getBoundingClientRect().top + currentY() - margin);
}
