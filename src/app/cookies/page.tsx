import type { Metadata } from "next";
import { site } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { LegalDoc } from "@/components/marketing/LegalDoc";

export const metadata: Metadata = buildMetadata({
  title: "Cookie policy",
  description: "How mcsecocleaning uses cookies, and how you control them under PECR.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <LegalDoc title="Cookie policy" updated="September 2026">
      <h2>How we use cookies</h2>
      <p>
        We keep cookies to a minimum. Essential cookies are needed to make the site work — for
        example to keep you signed in and to remember your cookie choice. These are always on.
      </p>

      <h2>Analytics cookies (with your consent)</h2>
      <p>
        With your consent, we use Google Analytics (GA4) to understand how the site is used so we can
        improve it. These cookies do not run until you accept them in the cookie banner, and you can
        decline and still use the whole site. IP addresses are anonymised.
      </p>

      <h2>Managing your choice</h2>
      <p>
        You can accept or decline analytics cookies in the banner shown on your first visit, and
        change your mind by clearing this site&apos;s data in your browser, which brings the banner
        back. You can also block cookies in your browser settings.
      </p>

      <h2>Cookies we set</h2>
      <ul>
        <li><strong>Essential</strong> — session and your saved cookie preference</li>
        <li><strong>Analytics (optional)</strong> — Google Analytics (GA4), only after consent</li>
      </ul>

      <p>Questions? Email {site.contact.email}.</p>
    </LegalDoc>
  );
}
