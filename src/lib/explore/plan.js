// The route of Explore mode: which projects become stops in the 3D city, in what
// order, and how scrolling moves the visitor along the street.
// Pure functions: no three.js and no DOM, so they are easy to test.

import { localizePost } from "@/lib/content/normalize";

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

/** "graduation", "coop" or "project". The two landmarks close the tour. */
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

/** The part of the city a stop stands in. The street gets fancier from "old" to "business". */
export function stopDistrict(kind, tier) {
  if (kind === "graduation") return "graduation";
  if (kind === "coop") return "business";
  if (tier < 0.3) return "old";
  return tier < 0.6 ? "mid" : "neon";
}

const dateOf = (post) => post.date || post.createdAt || "";

const nameOf = (item, lang) => (lang === "ar" ? item.arName : item.enName) || item.enName || item.arName || "";

/** Short tech names (from the skills list) that become the neon shop signs along the street. */
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

/**
 * Turns the published posts into the tour.
 * Order: projects from the oldest to the newest, then the graduation project,
 * then the co-op training, so the street starts small and ends at the landmarks.
 * `tier` runs from 0 (first stop) to 1 (last stop) and sets how grand a building is.
 */
export function buildTour({ posts = [], menu = [], skills = [], lang = "en" } = {}) {
  const ordered = posts
    .map((post) => ({ post, kind: stopKind(post) }))
    .sort((a, b) => {
      const rank = { project: 0, graduation: 1, coop: 2 };
      return rank[a.kind] - rank[b.kind] || dateOf(a.post).localeCompare(dateOf(b.post));
    });

  const progressBySlug = new Map(menu.filter((item) => item.slug).map((item) => [item.slug, item.progress]));

  const stops = ordered.map(({ post, kind }, index) => {
    const { title, description, content } = localizePost(post, lang);
    const tier = ordered.length > 1 ? index / (ordered.length - 1) : 0.5;
    const progress = progressBySlug.has(post.slug) ? progressBySlug.get(post.slug) : null;
    return {
      id: post.id || post.slug || `stop-${index}`,
      slug: post.slug,
      kind,
      theme: stopTheme(post, kind),
      district: stopDistrict(kind, tier),
      // Buildings alternate sides of the street, starting on the right.
      side: index % 2 === 0 ? 1 : -1,
      tier,
      title,
      description,
      hasDetails: Boolean(post.isExpandable && content),
      date: post.date,
      year: (post.date || "").slice(0, 4),
      imageUrl: post.imageUrl,
      githubUrl: post.githubUrl,
      liveUrl: post.liveUrl,
      progress,
      inProgress: progress !== null && progress < 100,
    };
  });

  // Unfinished projects that have no post yet stand as construction sites at the end of the street.
  const published = new Set(posts.map((post) => post.slug).filter(Boolean));
  const upcoming = menu
    .filter((item) => item.progress < 100 && !(item.slug && published.has(item.slug)))
    .map((item) => ({ id: item.id, name: nameOf(item, lang), progress: item.progress }))
    .filter((item) => item.name)
    .slice(0, 3);

  return { stops, upcoming, signs: signWords(skills) };
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

// --- The street ------------------------------------------------------------

// Distances along the street, in metres. The visitor flies toward negative z.
export const ROUTE = {
  intro: 64, // from the start to where the camera pauses for the first stop
  leg: 104, // between two stops
  finale: 124, // from the last stop to the end of the tour
  // Where the cross street lies between two stops, as a share of the leg. Past
  // the midpoint, so the building just visited has room behind it.
  crossAt: 0.58,
};

/** Where the camera pauses for stop `index`. */
export const stationZ = (index) => -(ROUTE.intro + index * ROUTE.leg);

/** Where the tour ends. */
export function routeEnd(stopCount) {
  return stopCount > 0 ? stationZ(stopCount - 1) - ROUTE.finale : -(ROUTE.intro + ROUTE.finale);
}

/** The camera's z for a tour position (see `tourPosition`). */
export function routeZ(position, stopCount) {
  const legs = legCount(stopCount);
  const clamped = clamp(position, 0, legs);
  const leg = Math.min(Math.floor(clamped), legs - 1);
  const from = leg === 0 ? 0 : stationZ(leg - 1);
  const to = leg >= stopCount ? routeEnd(stopCount) : stationZ(leg);
  return from + (to - from) * (clamped - leg);
}
