import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { titleTemplate } from "@/lib/seo/metadata";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: titleTemplate,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.company.registeredName }],
  formatDetection: { telephone: true },
  alternates: { canonical: "/" },
};

/**
 * The document, and nothing else.
 *
 * The site's own chrome moved to `(site)/layout.tsx` in L3 so that the admin
 * area is not wrapped in it — see `SiteChrome` for why. A layout in Next always
 * composes with its parent, so the only way to give one part of the app
 * different chrome is for the root to carry none.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
