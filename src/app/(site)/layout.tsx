import { SiteChrome } from "@/components/layout/SiteChrome";

/**
 * The public website's chrome (§12). Everything a customer sees is in this
 * route group; the admin area and the API are not, so they are not wrapped in a
 * marketing header, a sticky "Get a price" bar or a cookie banner.
 *
 * A route group's name never appears in a URL, so every public path is
 * unchanged by this file existing.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
