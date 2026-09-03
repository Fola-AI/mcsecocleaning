import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * robots.txt (§5.1). Authenticated + transactional routes are disallowed and
 * are also noindex at the page level: booking wizard, account, admin, crew, API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/book", "/account", "/admin", "/crew", "/api/"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
