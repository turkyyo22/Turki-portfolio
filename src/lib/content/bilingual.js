// Helpers for content written in both English and Arabic ({ en: {...}, ar: {...} }).
// Pure functions, shared by the admin dashboard and its tests.

export const OTHER_LANG = Object.freeze({ en: "ar", ar: "en" });
export const LANG_NAMES = Object.freeze({ en: "English", ar: "Arabic" });

const isFilled = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Compares the two language versions field by field.
 * - `missing`: written in one language only, so it can be translated ({ field, lang } names the empty side)
 * - `blank`: empty in both languages, so it has to be written first
 */
export function bilingualGaps(value, fields) {
  const missing = [];
  const blank = [];
  for (const field of fields) {
    const hasAr = isFilled(value?.ar?.[field]);
    const hasEn = isFilled(value?.en?.[field]);
    if (!hasAr && !hasEn) blank.push(field);
    else if (!hasAr) missing.push({ field, lang: "ar" });
    else if (!hasEn) missing.push({ field, lang: "en" });
  }
  return { missing, blank };
}

/** Groups missing fields into one translation request per direction. */
export function translationJobs(value, missing) {
  const jobs = new Map();
  for (const { field, lang } of missing) {
    const from = OTHER_LANG[lang];
    if (!jobs.has(lang)) jobs.set(lang, { from, to: lang, fields: {} });
    jobs.get(lang).fields[field] = value[from][field];
  }
  return [...jobs.values()];
}
