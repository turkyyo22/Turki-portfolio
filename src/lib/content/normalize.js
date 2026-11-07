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
