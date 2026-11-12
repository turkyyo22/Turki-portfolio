// The site's accent colours. Visitors pick one with the swatch button in the
// navigation bar (AccentPicker.jsx); the choice is saved in their browser.
//
// The page itself is coloured by CSS variables in globals.css: :root holds the
// default (cyan), and a :root[data-accent="…"] block overrides it for each other
// colour. This table carries the same values for the parts drawn in JavaScript
// (the particle network and the 3D robot) and for the picker's swatches.
// src/app/themeColors.test.js checks that the two stay in step.
//
// Fields:
//   primary, secondary  the two accent slots, --accent-cyan and --accent-blue in CSS
//                       ("cyan" and "blue" are the slots' names in every colour)
//   glow, deep          lighter and darker shades: --accent-glow and --accent-deep
//   metal, ambient      used only by the 3D robot (its ears and antenna, and the
//                       tint of the light around it)
//
// The primary colour is also used for text on the near-black page and behind the
// dark text of buttons, so it needs a contrast of at least 4.5:1 with #050A15.
// That is why the purple is no darker than Tailwind's purple-500.

export const ACCENTS = [
  { id: "cyan", primary: "#00E5FF", secondary: "#3B82F6", glow: "#7DF9FF", deep: "#00B8D9", metal: "#0B9FB5", ambient: "#9FDCFF" },
  { id: "purple", primary: "#A855F7", secondary: "#9333EA", glow: "#D8B4FE", deep: "#6B21A8", metal: "#763BAD", ambient: "#D9C2FF" },
  { id: "silver", primary: "#E2E8F0", secondary: "#94A3B8", glow: "#F8FAFC", deep: "#64748B", metal: "#9EA2A8", ambient: "#E5E7EB" },
  { id: "amber", primary: "#D97706", secondary: "#B45309", glow: "#FBBF24", deep: "#92400E", metal: "#985304", ambient: "#FFD9A0" },
];

export const DEFAULT_ACCENT = ACCENTS[0].id;

const STORAGE_KEY = "accent";
const CHANGE_EVENT = "accentchange";
const ATTRIBUTE = "data-accent";

const isAccent = (id) => ACCENTS.some((accent) => accent.id === id);

/** The colours for `id`, or the default colours when `id` is unknown. */
export function accentById(id) {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0];
}

/**
 * Runs in <head> before the page paints and applies the colour the visitor saved
 * on an earlier visit, so the page never flashes cyan first. Anything unknown in
 * storage is ignored, and the default needs no attribute.
 */
export const applySavedAccentScript = `(function(){try{var a=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(a!==${JSON.stringify(DEFAULT_ACCENT)}&&${JSON.stringify(ACCENTS.map((accent) => accent.id))}.indexOf(a)!==-1)document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},a);}catch(e){}})();`;

/** The colour on the page right now. */
export function currentAccent() {
  if (typeof document === "undefined") return DEFAULT_ACCENT;
  const id = document.documentElement.getAttribute(ATTRIBUTE);
  return isAccent(id) ? id : DEFAULT_ACCENT;
}

/** Switches the page to `id` and remembers it for the visitor's next visit. */
export function setAccent(id) {
  if (!isAccent(id) || id === currentAccent()) return;

  const apply = () => {
    const root = document.documentElement;
    if (id === DEFAULT_ACCENT) root.removeAttribute(ATTRIBUTE);
    else root.setAttribute(ATTRIBUTE, id);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  // Where the browser supports it, the old colours fade into the new ones.
  if (typeof document.startViewTransition === "function") {
    const transition = document.startViewTransition(apply);
    // When the browser skips the fade (a hidden tab, a busy page), these promises
    // reject. The colour still changes, so that isn't an error worth reporting.
    Promise.allSettled([transition?.ready, transition?.finished, transition?.updateCallbackDone]);
  } else {
    apply();
  }

  try {
    if (id === DEFAULT_ACCENT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage can be blocked (private windows, strict settings); the colour still applies to this visit.
  }
}

/** Calls `handler` after every colour change. Returns a function that stops listening. */
export function onAccentChange(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
