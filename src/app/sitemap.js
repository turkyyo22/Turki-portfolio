import { LOCALES } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

// The public pages: the portfolio itself, and Explore mode (its 3D tour).
const PAGES = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/explore", changeFrequency: "monthly", priority: 0.6 },
];

export default function sitemap() {
  return PAGES.flatMap(({ path, changeFrequency, priority }) => {
    const languages = Object.fromEntries(LOCALES.map((lang) => [lang, `${SITE_URL}/${lang}${path}`]));
    return LOCALES.map((lang) => ({
      url: `${SITE_URL}/${lang}${path}`,
      changeFrequency,
      // The Arabic copy of a page ranks just under its English one, as before.
      priority: lang === "en" ? priority : Math.round((priority - 0.1) * 10) / 10,
      alternates: { languages },
    }));
  });
}
