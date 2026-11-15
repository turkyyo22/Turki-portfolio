// Turns raw Firestore documents into the shapes the UI and the assistant use.
// Pure functions: no I/O, safe to import anywhere and easy to unit test.

const LANGS = ["en", "ar"];

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Only http(s) links are allowed, so a bad value can never become a `javascript:` URL. */
export function safeUrl(value) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeTags(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = text(item);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, 12);
}

function localizedText(raw) {
  return {
    title: text(raw?.title),
    description: text(raw?.description),
    content: text(raw?.content),
  };
}

// --- Explore mode (the 3D city) ---------------------------------------------
// Optional settings for how a post appears in the city, edited in the admin
// dashboard. Every field may be empty; the city then picks a default.

export const EXPLORE_SIZES = ["small", "medium", "large"];

// What the guide robot says about a building, written per language. Each kind
// holds a few variants so the robot doesn't repeat itself.
export const EXPLORE_LINE_KINDS = { arrival: 3, fact: 3, detail: 2 };
export const LINE_MAX_CHARS = 180;
export const TAGLINE_MAX_CHARS = 48;

function lineList(value, max) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => text(item).slice(0, LINE_MAX_CHARS))
    .filter(Boolean)
    .slice(0, max);
}

/** The robot's lines about one building in one language. */
export function normalizeExploreLines(raw) {
  const lines = {};
  for (const [kind, max] of Object.entries(EXPLORE_LINE_KINDS)) lines[kind] = lineList(raw?.[kind], max);
  lines.tagline = text(raw?.tagline).slice(0, TAGLINE_MAX_CHARS);
  return lines;
}

/**
 * - `place`: where the building stands (a place id from src/lib/explore/city.js), or "" to let the city choose.
 * - `size`: "small", "medium" or "large", or "" for the place's own size.
 * - `type`: the kind of building ("workshop", "tower", …), or "" for the place's default.
 * - `accent`: a "#rrggbb" neon colour for the building, or "".
 * - `lines`: the guide robot's lines about it, per language.
 */
export function normalizeExplore(raw) {
  const place = text(raw?.place).toLowerCase();
  const type = text(raw?.type).toLowerCase();
  const accent = text(raw?.accent).toLowerCase();
  const lines = {};
  for (const lang of LANGS) lines[lang] = normalizeExploreLines(raw?.lines?.[lang]);
  return {
    place: /^[a-z0-9-]{1,24}$/.test(place) ? place : "",
    size: EXPLORE_SIZES.includes(raw?.size) ? raw.size : "",
    type: /^[a-z]{2,24}$/.test(type) ? type : "",
    accent: /^#[0-9a-f]{6}$/.test(accent) ? accent : "",
    lines,
  };
}

/** True when normalized `explore` settings hold nothing: no place, look or robot line. */
export function exploreIsEmpty(explore) {
  if (!explore) return true;
  if (explore.place || explore.size || explore.type || explore.accent) return false;
  return LANGS.every((lang) => {
    const lines = explore.lines?.[lang];
    return !lines?.tagline && Object.keys(EXPLORE_LINE_KINDS).every((kind) => !lines?.[kind]?.length);
  });
}

export function normalizePost(raw) {
  const post = {
    id: text(raw?.id),
    slug: text(raw?.slug),
    date: text(raw?.date),
    createdAt: text(raw?.createdAt),
    imageUrl: safeUrl(raw?.imageUrl),
    isExpandable: Boolean(raw?.isExpandable),
    tags: normalizeTags(raw?.tags),
    githubUrl: safeUrl(raw?.githubUrl),
    liveUrl: safeUrl(raw?.liveUrl),
    explore: normalizeExplore(raw?.explore),
  };
  for (const lang of LANGS) post[lang] = localizedText(raw?.[lang]);
  return post;
}

/** The post's text in `lang`, falling back to the other language when a field is empty. */
export function localizePost(post, lang) {
  const primary = post?.[lang] || {};
  const fallback = post?.[lang === "ar" ? "en" : "ar"] || {};
  return {
    title: primary.title || fallback.title || "",
    description: primary.description || fallback.description || "",
    content: primary.content || fallback.content || "",
  };
}

export function normalizeSkill(raw) {
  return {
    id: text(raw?.id),
    order: Number(raw?.order) || 0,
    enTitle: text(raw?.enTitle),
    arTitle: text(raw?.arTitle),
    items: (Array.isArray(raw?.items) ? raw.items : []).map(text).filter(Boolean),
  };
}

export function normalizeProjectsMenu(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .map((item, index) => ({
      id: text(item?.id) || `project-${index}`,
      enName: text(item?.enName),
      arName: text(item?.arName),
      progress: Math.max(0, Math.min(100, Number(item?.progress) || 0)),
      slug: text(item?.slug),
      order: Number(item?.order) || index + 1,
    }))
    .filter((item) => item.enName || item.arName)
    .sort((a, b) => a.order - b.order);
}

export function normalizeSocials(raw) {
  return {
    github: safeUrl(raw?.github),
    linkedin: safeUrl(raw?.linkedin),
    email: text(raw?.email),
    phone: text(raw?.phone),
  };
}

/** Metadata only: the PDF itself is loaded separately so it never bloats the page HTML. */
export function normalizeCvMeta(raw) {
  return {
    available: Boolean(text(raw?.url)),
    fileName: text(raw?.fileName) || "CV.pdf",
    updatedAt: text(raw?.updatedAt),
  };
}

/** Splits a base64 `data:` URL into its media type and payload. Returns null for anything else. */
export function parseDataUrl(value) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(text(value));
  if (!match || !match[2]) return null;
  return { mediaType: match[1] || "application/octet-stream", base64: match[3] };
}
