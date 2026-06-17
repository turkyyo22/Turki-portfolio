import { NextResponse } from "next/server";

const locales = ["en", "ar"];
const defaultLocale = "en";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // هذه الخطوة لمنع توجيه ملفات النظام والصور
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // فحص ما إذا كان الرابط لا يحتوي على en أو ar
  const pathnameIsMissingLocale = locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  // التوجيه التلقائي إلى اللغة الإنجليزية إذا لم تكن موجودة
  if (pathnameIsMissingLocale) {
    return NextResponse.redirect(
      new URL(`/${defaultLocale}${pathname}`, request.url)
    );
  }
}

export const config = {
  matcher: ["/((?!_next).*)"],
};