import Link from "next/link";

import { SiteChrome } from "@/components/layout/SiteChrome";

/**
 * The root 404.
 *
 * It wraps itself in the site chrome explicitly, because the root layout no
 * longer carries any (see `SiteChrome`): someone who mistypes a URL should land
 * on something that still looks like the website, with a way back into it.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <section className="container-page py-24 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-4xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          The page may have moved. Try one of these instead.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">Home</Link>
          <Link href="/prices" className="btn btn-outline">Prices</Link>
          <Link href="/book" className="btn btn-outline">Get a price</Link>
        </div>
      </section>
    </SiteChrome>
  );
}
