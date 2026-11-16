// Pure helpers for the tour of the 3D city: what kind of post a stop is (a
// project, the graduation project or the co-op training), which hologram floats
// above its building, the words on the street signs, and how scrolling drives the
// visitor along the route. No three.js and no DOM, so they are easy to test.
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

/**
 * The names over the city's shop fronts, in the two languages of the site, as
 * on any street in the Kingdom. They are scenery, drawn into the 3D picture (see
 * drawShopNames in engine/signs.js); the page loads its fonts for them.
 */
export const SHOP_NAMES = [
  "CAFÉ", "مقهى", "BOOKS", "مكتبة", "BAKERY", "مخبز", "PHARMACY", "صيدلية",
  "MARKET", "بقالة", "TAILOR", "خياط", "BARBER", "حلاق", "NOODLES", "شاورما",
  "ARCADE", "ألعاب", "REPAIR", "صيانة", "FLOWERS", "ورود", "SWEETS", "حلويات",
  "OPEN 24H", "مفتوح", "GALLERY", "معرض", "DATES", "تمور", "RECORDS", "عطور",
];

// --- Scrolling -------------------------------------------------------------
// Scrolling the page drives the visitor along the route. The page is as long as
// the route, at PIXELS_PER_METRE, so the same scroll always covers the same
// ground: a metre of road costs a metre of scrolling while cruising, and up to
// three near a stop, where the drive slows so each building gets its moment.

/** Pixels of scrolling per metre of cruising: one notch of a mouse wheel (about 100 px) drives about 7 m. */
export const PIXELS_PER_METRE = 14;

// The share of cruising speed kept at a stop, and how far from it (metres) the drive is back to full speed.
const STOP_SPEED = 0.32;
const EASE_DISTANCE = 55;
// How close (metres along the route) counts as being at a stop, at the start or at the end.
const STOP_REACH = 30;
const INTRO_REACH = 14;
const FINALE_REACH = 42;
// The step of the table that turns scrolling into distance, in metres.
const TABLE_STEP = 1;

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * The tour as the visitor scrolls through it. `stopDistances` is how far along
 * the route each stop lies, in route order, and `routeLength` the whole route
 * (see planRoute in city.js), both in metres. Returns:
 * - `count` stops, `length` (metres of route) and `scrollLength` (metres of scrolling)
 * - `distanceAt(progress)`: scroll progress (0 to 1) to metres along the route
 * - `progressAt(distance)`: the other way round
 * - `progressOfStop(index)`: the scroll progress at which stop `index` is reached
 *   (below 0 is the start, `count` and above the end)
 * - `positionAt(distance)`: the same place counted in legs: 0 the start, 1 the
 *   first stop, … `count + 1` the end
 * - `nearestStop(distance)`: { index, away } (index -1 when there are no stops)
 * - `stageAt(distance)`: { kind: "intro" | "cruise" | "stop" | "finale", index },
 *   for the guide and the on-screen card. While cruising, `index` is the stop
 *   ahead (`count` when the end is next).
 */
export function createTour(stopDistances = [], routeLength = 0) {
  const length = Math.max(0, Number(routeLength) || 0);
  const stops = stopDistances.map((distance) => clamp(Number(distance) || 0, 0, length));
  const count = stops.length;
  const bounds = [0, ...stops, length];

  const nearestStop = (distance) => {
    let index = -1;
    let away = Infinity;
    for (let i = 0; i < count; i += 1) {
      const gap = Math.abs(distance - stops[i]);
      if (gap < away) {
        away = gap;
        index = i;
      }
    }
    return { index, away };
  };
  /** The share of cruising speed at a point on the route. */
  const speedAt = (distance) => STOP_SPEED + (1 - STOP_SPEED) * smooth(clamp(nearestStop(distance).away / EASE_DISTANCE, 0, 1));

  // table[i] is the scrolling it takes to reach i × step metres along the route.
  const steps = Math.max(1, Math.ceil(length / TABLE_STEP));
  const step = length / steps;
  const table = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i += 1) table[i + 1] = table[i] + step / speedAt((i + 0.5) * step);
  const scrollLength = table[steps];

  const distanceAt = (progress) => {
    if (!(scrollLength > 0)) return 0;
    const scroll = clamp(Number(progress) || 0, 0, 1) * scrollLength;
    let low = 0;
    let high = steps;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (table[middle] <= scroll) low = middle;
      else high = middle;
    }
    const span = table[low + 1] - table[low];
    return (low + (span > 0 ? (scroll - table[low]) / span : 0)) * step;
  };

  const progressAt = (distance) => {
    if (!(scrollLength > 0)) return 0;
    const at = clamp(Number(distance) || 0, 0, length) / step;
    const low = Math.min(Math.floor(at), steps - 1);
    return (table[low] + (table[low + 1] - table[low]) * (at - low)) / scrollLength;
  };

  const positionAt = (distance) => {
    const at = clamp(Number(distance) || 0, 0, length);
    let leg = 0;
    while (leg < count && at >= bounds[leg + 1]) leg += 1;
    const span = bounds[leg + 1] - bounds[leg];
    return leg + (span > 0 ? (at - bounds[leg]) / span : 0);
  };

  return {
    count,
    length,
    scrollLength,
    stops,
    distanceAt,
    progressAt,
    positionAt,
    nearestStop,
    progressOfStop(index) {
      if (index < 0) return 0;
      if (index >= count) return 1;
      return progressAt(stops[index]);
    },
    stageAt(distance) {
      const at = clamp(Number(distance) || 0, 0, length);
      const near = nearestStop(at);
      if (near.index >= 0 && near.away < STOP_REACH) return { kind: "stop", index: near.index };
      if (at > length - FINALE_REACH) return { kind: "finale", index: count };
      if (at < INTRO_REACH) return { kind: "intro", index: 0 };
      return { kind: "cruise", index: stops.filter((stop) => stop <= at).length };
    },
  };
}
