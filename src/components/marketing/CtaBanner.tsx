import Link from "next/link";
import { site } from "@/config/site";

export function CtaBanner({
  title = "Ready for a cleaner, greener home?",
  subtitle = "Get a fixed online price in under two minutes — or call and we'll book you in.",
  primaryHref = "/book",
  primaryLabel = "Get a price",
}: {
  title?: string;
  subtitle?: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <section className="py-14 md:py-20">
      <div className="container-page">
        <div className="rounded-2xl bg-brand px-6 py-12 text-center text-white md:px-12">
          <h2 className="text-3xl font-bold md:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">{subtitle}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={primaryHref} className="btn bg-white text-brand-strong hover:bg-white/90">
              {primaryLabel}
            </Link>
            <a href={`tel:${site.contact.phone}`} className="btn btn-outline border-white/70 text-white">
              📞 {site.contact.phoneDisplay}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
