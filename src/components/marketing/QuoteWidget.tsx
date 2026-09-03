"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { selfServeServices } from "@/config/services";
import { checkServiceArea } from "@/lib/serviceArea";

/**
 * Above-the-fold quote starter (§8) — postcode (booking step 0 §6.1) + service,
 * then routes into the booking wizard. Out-of-area postcodes get a waitlist
 * path rather than a dead end.
 *
 * The full instant-price engine is Phase 2; this widget is the entry point and
 * validates the service area up front so nobody completes a form we can't fulfil.
 */
export function QuoteWidget() {
  const router = useRouter();
  const [postcode, setPostcode] = useState("");
  const [service, setService] = useState(selfServeServices[0]?.slug ?? "");
  const [touched, setTouched] = useState(false);

  const check = useMemo(
    () => (postcode.trim() ? checkServiceArea(postcode) : null),
    [postcode]
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check?.valid) return;
    if (!check.inArea) {
      router.push(`/areas-we-cover?waitlist=1&postcode=${encodeURIComponent(check.outward ?? "")}`);
      return;
    }
    const params = new URLSearchParams({ service, postcode: check.outward ?? "" });
    router.push(`/book?${params.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card w-full max-w-md p-5 shadow-xl"
      aria-label="Get an instant cleaning quote"
    >
      <p className="eyebrow">Instant online price</p>
      <h2 className="mt-1 text-xl font-bold">Get a fixed price in under 2 minutes</h2>

      <label className="mt-4 block text-sm font-semibold" htmlFor="qw-service">
        What do you need?
      </label>
      <select
        id="qw-service"
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-base"
        value={service}
        onChange={(e) => setService(e.target.value)}
      >
        {selfServeServices.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-sm font-semibold" htmlFor="qw-postcode">
        Your postcode
      </label>
      <input
        id="qw-postcode"
        inputMode="text"
        autoCapitalize="characters"
        placeholder="e.g. SW4 7AA"
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-base"
        value={postcode}
        onChange={(e) => setPostcode(e.target.value)}
        aria-describedby="qw-area-msg"
      />

      <div id="qw-area-msg" aria-live="polite" className="mt-2 min-h-5 text-sm">
        {touched && check && !check.valid && (
          <span className="text-error">Please enter a valid UK postcode.</span>
        )}
        {check?.valid && check.inArea && (
          <span className="text-success">✓ We cover {check.areaName}.</span>
        )}
        {check?.valid && !check.inArea && (
          <span className="text-ink-soft">
            We&apos;re not in {check.outward} yet — join the waitlist and we&apos;ll be in touch.
          </span>
        )}
      </div>

      <button type="submit" className="btn btn-primary mt-3 w-full">
        {check?.valid && !check.inArea ? "Join the waitlist" : "See my price"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-soft">
        No obligation · No card needed for a quote · VAT-inclusive prices
      </p>
    </form>
  );
}
