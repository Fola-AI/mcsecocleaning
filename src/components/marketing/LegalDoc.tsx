import type { ReactNode } from "react";
import { PageHeader } from "@/components/marketing/PageHeader";

/**
 * Shared wrapper for legal pages. Renders a header, a "draft — to be reviewed"
 * notice (removed once §Phase 6 legal review is done), and a prose container.
 */
export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} crumbs={[{ name: "Home", path: "/" }, { name: title, path: "#" }]} />
      <div className="container-page py-12">
        <p className="text-sm text-ink-soft">Last updated: {updated}</p>
        {/* TODO(legal §Phase 6): have a solicitor review before launch, then remove this notice. */}
        <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          Draft for review. This document must be checked by a qualified adviser before launch.
        </p>
        <div className="prose-local mt-8 max-w-3xl">{children}</div>
      </div>
    </>
  );
}
