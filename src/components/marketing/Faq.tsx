"use client";

import { useState } from "react";
import type { ServiceFaq } from "@/config/services";

/** Accessible FAQ accordion. FAQPage JSON-LD is emitted separately (§5.2). */
export function Faq({ faqs, heading = "Frequently asked questions" }: { faqs: ServiceFaq[]; heading?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold md:text-3xl">{heading}</h2>
      <dl className="mt-6 divide-y divide-line border-y border-line">
        {faqs.map((f, i) => (
          <FaqItem key={i} faq={f} />
        ))}
      </dl>
    </div>
  );
}

function FaqItem({ faq }: { faq: ServiceFaq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-1">
      <dt>
        <button
          className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{faq.q}</span>
          <span aria-hidden className="shrink-0 text-brand-strong text-xl">
            {open ? "–" : "+"}
          </span>
        </button>
      </dt>
      {open && (
        <dd className="pb-4 pr-8 text-ink-soft">
          {faq.a}
        </dd>
      )}
    </div>
  );
}
