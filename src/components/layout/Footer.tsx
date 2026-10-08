import Link from "next/link";
import { site, formatAddress } from "@/config/site";
import { orderedServices } from "@/config/services";
import { crewAssurancePhrase } from "@/lib/trust";

/**
 * Footer with Companies Act 2006 details (registered name, number, address)
 * and the NAP that MUST match the Google Business Profile (§5.8, §8, §10.2).
 */
const crewPhrase = crewAssurancePhrase();

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-line bg-brand-ink text-white/90">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="text-lg font-bold text-white">
            mcs<span className="text-white/70">eco</span>cleaning
          </div>
          <p className="mt-3 text-sm text-white/70">{site.tagline}.</p>
          <p className="mt-4 text-sm">
            <span className="block font-semibold text-white">Call us</span>
            <a href={`tel:${site.contact.phone}`} className="underline">
              {site.contact.phoneDisplay}
            </a>
          </p>
          <p className="mt-2 text-sm">
            <a href={`mailto:${site.contact.email}`} className="underline">
              {site.contact.email}
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">Services</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {orderedServices.map((s) => (
              <li key={s.slug}>
                <Link href={`/${s.slug}`} className="hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">Company</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/about" className="hover:underline">About us</Link></li>
            <li><Link href="/eco-cleaning" className="hover:underline">Our eco approach</Link></li>
            <li><Link href="/guarantee" className="hover:underline">Re-clean guarantee</Link></li>
            <li><Link href="/reviews" className="hover:underline">Reviews</Link></li>
            <li><Link href="/areas-we-cover" className="hover:underline">Areas we cover</Link></li>
            <li><Link href="/blog" className="hover:underline">Cleaning guides</Link></li>
            <li><Link href="/contact" className="hover:underline">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">Legal</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/privacy" className="hover:underline">Privacy notice</Link></li>
            <li><Link href="/cookies" className="hover:underline">Cookie policy</Link></li>
            <li><Link href="/terms" className="hover:underline">Terms &amp; conditions</Link></li>
            <li><Link href="/cancellation-policy" className="hover:underline">Cancellation policy</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-6 text-xs text-white/60">
          {/* Companies Act 2006 registered-company particulars. */}
          <p>
            {site.company.registeredName} is a company registered in England &amp; Wales, company
            number {site.company.companyNumber}. Registered office:{" "}
            {formatAddress(site.company.registeredAddress)}.
            {site.company.vatNumber ? ` VAT number ${site.company.vatNumber}.` : ""}
          </p>
          <p className="mt-2">
            © {year} {site.company.registeredName}.{" "}
            {crewPhrase ? `${crewPhrase[0].toUpperCase()}${crewPhrase.slice(1)} crews. ` : ""}
            Registered with the ICO ({site.company.icoRegistration}).
          </p>
        </div>
      </div>
    </footer>
  );
}
