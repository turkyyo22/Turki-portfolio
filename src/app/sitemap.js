import { LOCALES } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export default function sitemap() {
  const languages = Object.fromEntries(LOCALES.map((lang) => [lang, `${SITE_URL}/${lang}`]));
  return LOCALES.map((lang) => ({
    url: `${SITE_URL}/${lang}`,
    changeFrequency: "weekly",
    priority: lang === "en" ? 1 : 0.9,
    alternates: { languages },
  }));
}
