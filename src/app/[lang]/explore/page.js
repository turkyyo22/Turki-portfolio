import ExploreMode from "@/components/explore/ExploreMode";
import { getDictionary } from "@/get-dictionary";
import { buildTour } from "@/lib/explore/plan";
import { getPosts, getProjectsMenu, getSkills } from "@/lib/server/content";

// The city is built from the same content as the main page and refreshes with it.
export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { explore } = await getDictionary(lang);
  const { title, description } = explore.meta;
  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/explore`,
      languages: { en: "/en/explore", ar: "/ar/explore", "x-default": "/en/explore" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}/explore`,
      siteName: "Turki Aloufi",
      title,
      description,
      locale: lang === "ar" ? "ar_SA" : "en_US",
      alternateLocale: lang === "ar" ? ["en_US"] : ["ar_SA"],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Explore mode: an optional 3D tour of the projects as a neon city.
 * The page only prepares the tour's content; the 3D part loads in the browser.
 */
export default async function ExplorePage({ params }) {
  const { lang } = await params;
  const [dict, posts, menu, skills] = await Promise.all([getDictionary(lang), getPosts(), getProjectsMenu(), getSkills()]);
  const tour = buildTour({ posts, menu, skills, lang });

  return <ExploreMode lang={lang} dict={dict.explore} tour={tour} />;
}
