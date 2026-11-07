import { NextResponse } from "next/server";

import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n";

// Next.js 16 renamed Middleware to Proxy; the behavior is unchanged.
// Sends any path without a language prefix to the English version.
export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Leave framework files, the API and static files (anything with an extension) alone.
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const hasLocale = LOCALES.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (!hasLocale) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next).*)"],
};
