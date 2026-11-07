import { SITE_URL } from "@/lib/site";

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/en/admin", "/ar/admin", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
