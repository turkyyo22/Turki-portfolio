import { Tajawal } from "next/font/google";

import MotionProvider from "@/components/MotionProvider";
import { getDictionary } from "@/get-dictionary";
import { applySavedAccentScript } from "@/lib/accent";
import { LOCALES, directionOf } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const arabic = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Only /en and /ar exist; anything else is a 404 instead of a half-rendered page.
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { meta } = await getDictionary(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { en: "/en", ar: "/ar", "x-default": "/en" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}`,
      siteName: "Turki Aloufi",
      title: meta.title,
      description: meta.description,
      locale: lang === "ar" ? "ar_SA" : "en_US",
      alternateLocale: lang === "ar" ? ["en_US"] : ["ar_SA"],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  };
}

export const viewport = {
  themeColor: "#050A15",
  colorScheme: "dark",
};

// Runs before the page paints: on a reload, turn off the browser's scroll
// restoration (and drop any #hash jump) so the page always starts at the top.
const resetScrollOnReload = `(function(){try{var n=performance.getEntriesByType("navigation")[0];if(!n||n.type!=="reload")return;history.scrollRestoration="manual";if(location.hash)history.replaceState(history.state,"",location.pathname+location.search);window.scrollTo(0,0);}catch(e){}})();`;

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  const bodyFont = lang === "ar" ? `${arabic.className} antialiased` : "antialiased";

  // The head script also applies the accent colour the visitor picked on an earlier
  // visit (a data-accent attribute on <html>), before anything is painted.
  // suppressHydrationWarning lets React keep that attribute, which the server
  // can't know about, instead of treating it as a mismatch.
  return (
    <html lang={lang} dir={directionOf(lang)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: resetScrollOnReload + applySavedAccentScript }} />
      </head>
      <body className={bodyFont}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
