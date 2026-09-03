"use client";

import Link from "next/link";
import { useState } from "react";
import { orderedServices } from "@/config/services";
import { site } from "@/config/site";

const primaryLinks = [
  { href: "/prices", label: "Prices" },
  { href: "/eco-cleaning", label: "Eco cleaning" },
  { href: "/areas-we-cover", label: "Areas" },
  { href: "/guarantee", label: "Guarantee" },
  { href: "/about", label: "About" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-brand-strong">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
            ♻
          </span>
          <span>
            mcs<span className="text-brand">eco</span>cleaning
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button
              className="flex items-center gap-1 py-2 font-medium hover:text-brand-strong"
              aria-expanded={servicesOpen}
              aria-haspopup="true"
              onClick={() => setServicesOpen((v) => !v)}
            >
              Services <span aria-hidden>▾</span>
            </button>
            {servicesOpen && (
              <div className="absolute left-0 top-full w-72 rounded-xl border border-line bg-surface p-2 shadow-lg">
                {orderedServices.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/${s.slug}`}
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-brand-tint"
                  >
                    <span className="font-semibold text-ink">{s.name}</span>
                    <span className="block text-ink-soft">{s.tagline}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {primaryLinks.map((l) => (
            <Link key={l.href} href={l.href} className="font-medium hover:text-brand-strong">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a href={`tel:${site.contact.phone}`} className="font-semibold text-brand-strong">
            {site.contact.phoneDisplay}
          </a>
          <Link href="/book" className="btn btn-primary">
            Get a price
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className="text-xl">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav aria-label="Mobile" className="border-t border-line bg-surface lg:hidden">
          <div className="container-page flex flex-col py-3">
            <p className="eyebrow px-1 pt-2">Services</p>
            {orderedServices.map((s) => (
              <Link
                key={s.slug}
                href={`/${s.slug}`}
                className="rounded-lg px-1 py-2.5 font-medium"
                onClick={() => setOpen(false)}
              >
                {s.name}
              </Link>
            ))}
            <div className="my-2 h-px bg-line" />
            {primaryLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-1 py-2.5 font-medium"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/book" className="btn btn-primary mt-3" onClick={() => setOpen(false)}>
              Get a price
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
