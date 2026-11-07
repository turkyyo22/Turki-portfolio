export const LOCALES = ["en", "ar"];
export const DEFAULT_LOCALE = "en";

export const isLocale = (value) => LOCALES.includes(value);
export const directionOf = (lang) => (lang === "ar" ? "rtl" : "ltr");

/** Fills `{name}` placeholders in a dictionary string. */
export function format(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}
