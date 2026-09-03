import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { titleTemplate } from "@/lib/seo/metadata";
import { SkipLink } from "@/components/layout/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileCtaBar } from "@/components/layout/MobileCtaBar";
import { ConsentAnalytics } from "@/components/analytics/ConsentAnalytics";
import { JsonLd, localBusinessLd, organizationLd } from "@/lib/seo/jsonld";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
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
      </body>
    </html>
  );
}
