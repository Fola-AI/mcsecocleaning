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
  // Safety gate: the whole site is noindex until indexing is explicitly enabled
  // (set NEXT_PUBLIC_ALLOW_INDEXING="true" on the real production domain). This
  // stops test/preview deployments (e.g. *.vercel.app) getting indexed.
  const allowIndex = indexingAllowed();
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex || !allowIndex
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

/**
 * Whether search engines may index this deployment. Defaults to FALSE so test
 * and preview deployments stay out of the index; set NEXT_PUBLIC_ALLOW_INDEXING
 * ="true" only on the real production domain.
 */
export function indexingAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
}
