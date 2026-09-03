import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { services } from "@/config/services";
import { publishedLocationPages } from "@/config/areas";
import { blogPosts } from "@/content/blog";

/**
 * Auto-generated XML sitemap (§5.1). Only indexable public URLs are listed —
 * booking wizard, account, admin and crew routes are excluded (they are
 * noindex, §5.1).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = site.url;

  const staticPaths: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, freq: "weekly" },
    { path: "/prices", priority: 0.9, freq: "monthly" },
    { path: "/eco-cleaning", priority: 0.8, freq: "monthly" },
    { path: "/areas-we-cover", priority: 0.8, freq: "weekly" },
    { path: "/guarantee", priority: 0.7, freq: "monthly" },
    { path: "/reviews", priority: 0.7, freq: "weekly" },
    { path: "/about", priority: 0.6, freq: "monthly" },
    { path: "/contact", priority: 0.6, freq: "monthly" },
    { path: "/blog", priority: 0.7, freq: "weekly" },
    { path: "/privacy", priority: 0.3, freq: "yearly" },
    { path: "/cookies", priority: 0.3, freq: "yearly" },
    { path: "/terms", priority: 0.3, freq: "yearly" },
    { path: "/cancellation-policy", priority: 0.3, freq: "yearly" },
  ];

  const staticEntries = staticPaths.map((p) => ({
    url: `${base}${p.path === "/" ? "" : p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  const serviceEntries = services.map((s) => ({
    url: `${base}/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));

  const locationEntries = publishedLocationPages().map(({ area, serviceSlug }) => ({
    url: `${base}/${serviceSlug}/${area.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const blogEntries = blogPosts.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.updated ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...serviceEntries, ...locationEntries, ...blogEntries];
}
