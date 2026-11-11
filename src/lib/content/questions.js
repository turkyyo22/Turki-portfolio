// The suggested questions visitors can click: on the hero AI card and in the chat.
// Stored in Firestore (settings/questions) and edited in the admin dashboard;
// until the admin saves a list, the site uses the defaults in the dictionaries.
// Pure functions, shared by the server, the dashboard and tests.

export const QUESTIONS_DOC = "settings/questions";

export const QUESTION_LIMITS = Object.freeze({
  card: 12, // the AI card shows 3 at a time and "More questions" flips through the rest
  chat: 15, // the chat shows 3 at random
  chars: 140,
});

export const QUESTION_LISTS = Object.freeze(["card", "chat"]);

const text = (value) => (typeof value === "string" ? value.trim() : "");

function normalizeList(list, max) {
  const items = Array.isArray(list) ? list : [];
  const seen = new Set();
  const result = [];
  for (const [index, item] of items.entries()) {
    const en = text(item?.en).slice(0, QUESTION_LIMITS.chars);
    const ar = text(item?.ar).slice(0, QUESTION_LIMITS.chars);
    const key = `${en.toLowerCase()}|${ar}`;
    if ((!en && !ar) || seen.has(key)) continue;
    seen.add(key);
    result.push({ id: text(item?.id) || `q${index + 1}`, en, ar });
    if (result.length >= max) break;
  }
  return result;
}

/** Cleans the stored document. Returns null when the admin hasn't saved questions yet. */
export function normalizeQuestions(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    card: normalizeList(raw.card, QUESTION_LIMITS.card),
    chat: normalizeList(raw.chat, QUESTION_LIMITS.chat),
  };
}

/**
 * The questions in one language, falling back to the other language for an
 * item that has only one. Returns null when there's nothing to show, so the
 * caller can use the defaults instead of an empty list.
 */
export function localizeQuestions(list, lang) {
  if (!Array.isArray(list)) return null;
  const other = lang === "ar" ? "en" : "ar";
  const result = [...new Set(list.map((item) => item[lang] || item[other]).filter(Boolean))];
  return result.length > 0 ? result : null;
}

/** The default questions from the two dictionaries, paired by position. */
export function defaultQuestions(en, ar) {
  const pair = (enList = [], arList = [], prefix) =>
    enList.map((question, index) => ({ id: `${prefix}${index + 1}`, en: question, ar: arList[index] || "" }));
  return {
    card: pair(en?.hero?.aiCard?.suggestions, ar?.hero?.aiCard?.suggestions, "card"),
    chat: pair(en?.assistant?.suggestions, ar?.assistant?.suggestions, "chat"),
  };
}
