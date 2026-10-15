import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Crew", template: "%s · Crew" },
  robots: { index: false, follow: false },
};

/**
 * The crew app's own chrome (§9.2).
 *
 * Deliberately not the marketing chrome and not the admin chrome: this is a
 * phone, often on mobile data, held one-handed on a doorstep. No nav bar of
 * eight links, no cookie banner, nothing above the fold but the job.
 *
 * `max-w-md` keeps it readable if someone opens it on a laptop without
 * pretending it is a desktop tool.
 */
export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <main id="main" className="mx-auto max-w-md px-4 pb-24 pt-4">
        {children}
      </main>
    </div>
  );
}
