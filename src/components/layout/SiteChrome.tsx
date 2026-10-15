import type { ReactNode } from "react";

import { SkipLink } from "@/components/layout/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileCtaBar } from "@/components/layout/MobileCtaBar";
import { ConsentAnalytics } from "@/components/analytics/ConsentAnalytics";
import { JsonLd, localBusinessLd, organizationLd } from "@/lib/seo/jsonld";

/**
 * Everything that wraps a page a **customer** sees: the nav, the footer, the
 * sticky call bar, the structured data and the cookie consent prompt.
 *
 * It lives in a component rather than straight in the layout because two places
 * need it — the `(site)` route group and the root 404, which must still look
 * like the website when someone mistypes a URL.
 *
 * The admin area deliberately does **not** use it. Until L3 the root layout
 * wrapped every route, so the job board sat under a marketing header with a
 * "Get a price" call-to-action and the cookie banner floating over it: a quarter
 * of an operations screen spent on things an operator cannot act on, and a
 * consent prompt that is meaningless to a signed-in member of staff. §9.7 asks
 * for the day's state in thirty seconds, which starts with giving the screen to
 * the day.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <JsonLd data={[localBusinessLd(), organizationLd()]} />
      <Header />
      {/* pb accommodates the sticky mobile CTA bar */}
      <main id="main" className="flex-1 pb-20 lg:pb-0">
        {children}
      </main>
      <Footer />
      <MobileCtaBar />
      <ConsentAnalytics />
    </>
  );
}
