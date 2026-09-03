import Link from "next/link";
import { site } from "@/config/site";

/** Sticky mobile CTA bar (call + book) on all public pages (§8). */
export function MobileCtaBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      <div className="container-page grid grid-cols-2 gap-2 py-2">
        <a
          href={`tel:${site.contact.phone}`}
          className="btn btn-outline w-full"
          aria-label={`Call ${site.contact.phoneDisplay}`}
        >
          📞 Call
        </a>
        <Link href="/book" className="btn btn-primary w-full">
          Get a price
        </Link>
      </div>
    </div>
  );
}
