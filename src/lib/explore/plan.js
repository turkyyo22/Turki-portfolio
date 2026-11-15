// Pure helpers for the tour of the 3D city: what kind of post a stop is (a
// project, the graduation project or the co-op training), which hologram floats
// above its building, the words on the street signs, and how scrolling moves the
// visitor from stop to stop. No three.js and no DOM, so they are easy to test.
// The city's map and the route through it are in city.js.

const GRADUATION = /graduat|تخرج/i;
const COOP = /co-?op|تدريب تعاوني/i;

// What floats above a building, picked from the project's slug and English title.
const THEMES = [
  ["car", /\bcar\b|rental|vehicle/i],
  ["document", /\bcv\b|resume/i],
  ["robot", /assistant|chatbot|\bbot\b|\bcore\b/i],
  ["globe", /portfolio|website|command/i],
  ["nodes", /student|data structure|records/i],
  ["chart", /analytic|dashboard|report/i],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** "graduation", "coop" or "project". The first two are the city's landmarks. */
export function stopKind(post) {
  const text = `${post?.slug ?? ""} ${post?.en?.title ?? ""} ${post?.ar?.title ?? ""}`;
  if (post?.slug === "coop" || COOP.test(text)) return "coop";
  if (GRADUATION.test(text)) return "graduation";
  return "project";
}

/** The hologram above a building: "car", "robot", … or "gem" when nothing matches. */
export function stopTheme(post, kind = stopKind(post)) {
  if (kind === "graduation") return "cap";
  if (kind === "coop") return "bank";
  const text = `${post?.slug ?? ""} ${post?.en?.title ?? ""}`.replace(/-/g, " ");
  return THEMES.find(([, pattern]) => pattern.test(text))?.[0] ?? "gem";
}

/** Short tech names (from the skills list) that become the neon shop signs along the streets. */
export function signWords(skills, limit = 28) {
  const seen = new Set();
  const words = [];
  for (const skill of skills ?? []) {
    for (const item of skill.items ?? []) {
      const word = String(item).replace(/\(.*?\)/g, "").trim();
      const key = word.toLowerCase();
      if (word && word.length <= 14 && !seen.has(key)) {
        seen.add(key);
        words.push(word);
      }
    }
  }
  return words.slice(0, limit);
}

// --- Scrolling -------------------------------------------------------------

// How much the flight slows down near each stop: 0 keeps a constant speed, 1 comes to a halt.
export const DWELL = 0.72;

// How close (in legs) the visitor must be for a stop, the start or the end to count as "here".
const STOP_REACH = 0.3;
const INTRO_REACH = 0.22;
const FINALE_REACH = 0.34;

/** The tour has one leg up to each stop, and a last one to the end of the street. */
export const legCount = (stopCount) => stopCount + 1;

/**
 * Scroll progress (0 to 1) to a position on the tour, counted in legs:
 * 0 is the start, 1 the first stop, 2 the second, … and `stopCount + 1` the end.
 * Each leg eases in and out, so the flight lingers at every stop.
 */
export function tourPosition(progress, stopCount) {
  const legs = legCount(stopCount);
  const raw = clamp(Number(progress) || 0, 0, 1) * legs;
  const leg = Math.min(Math.floor(raw), legs - 1);
  const within = raw - leg;
  return leg + within - (DWELL / (2 * Math.PI)) * Math.sin(2 * Math.PI * within);
}

/** The scroll progress (0 to 1) at which stop `index` is reached. `stopCount` is the end. */
export function progressOfStop(index, stopCount) {
  return clamp((index + 1) / legCount(stopCount), 0, 1);
}

/**
 * Where the visitor is, for the guide and the on-screen card:
 * { kind: "intro" | "cruise" | "stop" | "finale", index }.
 * While cruising, `index` is the stop ahead (`stopCount` when the end is next).
 */
export function tourStage(position, stopCount) {
  const nearest = Math.round(position);
  if (nearest >= 1 && nearest <= stopCount && Math.abs(position - nearest) < STOP_REACH) {
    return { kind: "stop", index: nearest - 1 };
  }
  if (position > legCount(stopCount) - FINALE_REACH) return { kind: "finale", index: stopCount };
  if (position < INTRO_REACH) return { kind: "intro", index: 0 };
  return { kind: "cruise", index: clamp(Math.floor(position), 0, stopCount) };
}

/**
 * Turns a tour position (in legs) into a distance along the route, given where
 * each stop lies on it (`stopDistances`, in route order) and its total length.
 */
export function routeDistance(position, stopDistances, routeLength) {
  const bounds = [0, ...stopDistances, routeLength];
  const legs = bounds.length - 1;
  const clamped = clamp(Number(position) || 0, 0, legs);
  const leg = Math.min(Math.floor(clamped), legs - 1);
  return bounds[leg] + (bounds[leg + 1] - bounds[leg]) * (clamped - leg);
}
