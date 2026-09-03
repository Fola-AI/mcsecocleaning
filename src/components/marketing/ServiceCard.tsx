import Link from "next/link";
import type { Service } from "@/config/services";
import { formatPounds } from "@/lib/money";

const accentBar: Record<Service["accent"], string> = {
  leaf: "bg-leaf",
  moss: "bg-moss",
  sky: "bg-sky",
  clay: "bg-clay",
  slate: "bg-slate",
  sun: "bg-sun",
};

export function ServiceCard({ service }: { service: Service }) {
  const price =
    service.fromPricePence != null
      ? `From ${formatPounds(service.fromPricePence)}${service.fromUnit ? ` ${service.fromUnit}` : ""}`
      : "Quoted after survey";

  return (
    <Link
      href={`/${service.slug}`}
      className="card group relative flex flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${accentBar[service.accent]}`} />
      <h3 className="mt-1 text-lg font-bold text-ink group-hover:text-brand-strong">
        {service.name}
      </h3>
      <p className="mt-1 flex-1 text-sm text-ink-soft">{service.tagline}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-brand-strong">{price}</span>
        <span aria-hidden className="text-brand-strong transition group-hover:translate-x-0.5">
          →
        </span>
      </div>
      {service.channel === "rfq" && (
        <span className="mt-2 text-xs text-ink-soft">Commercial · request a quote</span>
      )}
    </Link>
  );
}
