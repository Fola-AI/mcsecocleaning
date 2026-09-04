import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { indexingAllowed } from "@/lib/seo/metadata";

/**
 * robots.txt (§5.1). Until indexing is explicitly enabled for the real domain
 * (NEXT_PUBLIC_ALLOW_INDEXING="true"), the whole site is disallowed so test /
 * preview deployments (e.g. *.vercel.app) are never crawled or indexed.
 * When enabled, only authenticated + transactional routes are disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
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
