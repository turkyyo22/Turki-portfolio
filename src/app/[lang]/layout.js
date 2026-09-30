import { Tajawal } from "next/font/google";
import "../globals.css";

const arabic = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata = {
  title: "Turki Alofi | Command Center",
  description: "Software Engineer Portfolio",
};

// Runs before the page paints: on a reload, turn off the browser's scroll
// restoration (and drop any #hash jump) so the page always starts at the top.
const resetScrollOnReload = `(function(){try{var n=performance.getEntriesByType("navigation")[0];if(!n||n.type!=="reload")return;history.scrollRestoration="manual";if(location.hash)history.replaceState(history.state,"",location.pathname+location.search);window.scrollTo(0,0);}catch(e){}})();`;

export default async function RootLayout({ children, params }) {

  const { lang } = await params;

  const dir = lang === "ar" ? "rtl" : "ltr";
  const bodyFont = lang === "ar" ? `${arabic.className} antialiased` : "antialiased";

  return (
    <html lang={lang} dir={dir}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: resetScrollOnReload }} />
      </head>
      <body className={bodyFont}>{children}</body>
    </html>
  );
}