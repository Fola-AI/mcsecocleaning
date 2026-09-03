import type { Metadata } from "next";
import { site } from "@/config/site";

/**
 * Metadata helpers (§5.1). Public pages are indexable with canonical URLs;
 * booking wizard, account, admin and crew routes MUST be noindex.
 */

interface PageMetaInput {
  title: string;
  description: string;
  /** Path beginning with "/". Used for canonical + OG url. */
  path: string;
  /** Set true for booking/account/admin/crew (§5.1). */
  noindex?: boolean;
  images?: string[];
}

export function buildMetadata({
  title,
  description,
  path,
  noindex,
  images,
}: PageMetaInput): Metadata {
  const url = `${site.url}${path === "/" ? "" : path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: site.name,
      title,
      description,
      url,
      locale: "en_GB",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}

/** Title suffix applied via the root template. */
export const titleTemplate = `%s | ${site.name}`;
