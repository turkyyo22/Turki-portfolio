import "server-only";

import { DEFAULT_LOCALE } from "@/lib/i18n";

const dictionaries = {
  en: () => import("../dictionaries/en.json").then((module) => module.default),
  ar: () => import("../dictionaries/ar.json").then((module) => module.default),
};

export const getDictionary = async (locale) => (dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE])();
