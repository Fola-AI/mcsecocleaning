"use client";

import { useMemo, useState, useTransition } from "react";
import { selfServeServices } from "@/config/services";
import { ROOM_KEYS, type RoomKey } from "@/lib/pricing/rate-card";
import { computeQuote } from "@/lib/quote";
import { formatPence } from "@/lib/money";
import { adminCreateBooking, type AdminBookingResult } from "@/app/actions/admin";

const ROOM_LABELS: Record<RoomKey, string> = {
  kitchens: "Kitchens", bathrooms: "Bathrooms", receptions: "Receptions",
  bedrooms: "Bedrooms", hallways: "Hallways", studies: "Studies", conservatories: "Conservatories",
};

export interface AdminBookingPrefill {
  serviceSlug?: string;
  postcode?: string;
  rooms?: Partial<Record<RoomKey, number>>;
  condition?: "standard" | "heavily_soiled";
  name?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  notes?: string;
}

export function AdminBookingForm({ prefill, leadId }: { prefill?: AdminBookingPrefill; leadId?: string } = {}) {
  const [f, setF] = useState({
    serviceSlug: prefill?.serviceSlug && selfServeServices.some((s) => s.slug === prefill.serviceSlug) ? prefill.serviceSlug : selfServeServices[0].slug,
    postcode: prefill?.postcode ?? "",
    rooms: {
      ...(Object.fromEntries(ROOM_KEYS.map((k) => [k, k === "kitchens" || k === "bathrooms" || k === "bedrooms" ? 1 : 0])) as Record<RoomKey, number>),
      ...prefill?.rooms,
    },
    condition: (prefill?.condition ?? "standard") as "standard" | "heavily_soiled",
    frequency: "one_off" as "one_off" | "weekly" | "fortnightly" | "monthly",
    slotStartISO: "",
    paymentMethod: "payment_link" as "payment_link" | "invoice",
    source: (leadId ? "admin" : "phone") as "phone" | "admin" | "partner",
    name: prefill?.name ?? "", email: prefill?.email ?? "", phone: prefill?.phone ?? "", addressLine1: prefill?.addressLine1 ?? "",
    notes: prefill?.notes ?? "",
    // Manual price override (§9.7) — pounds string, minutes string.
    overridePrice: "", overrideReason: "", overrideDuration: "",
  });
  const [result, setResult] = useState<AdminBookingResult | null>(null);
  const [pending, start] = useTransition();

  const quote = useMemo(
    () => computeQuote({ serviceSlug: f.serviceSlug, rooms: f.rooms, condition: f.condition, frequency: f.frequency }),
    [f.serviceSlug, f.rooms, f.condition, f.frequency]
  );
  const overridePence = f.overridePrice ? Math.round(Number(f.overridePrice) * 100) : undefined;
  const isOverride = overridePence != null && overridePence > 0;
  const overrideDurNum = f.overrideDuration ? Number(f.overrideDuration) : 0;
  // An escalated job has no engine price, so a manual price + reason + duration is
  // required. A manual price always needs a reason AND a non-zero on-site duration
  // (a zero-length slot can't be scheduled).
  const overrideRequired = quote.escalate;
  const canSubmit =
    Boolean(f.name && f.email && f.postcode) &&
    (!overrideRequired || isOverride) &&
    (!isOverride || (f.overrideReason.trim().length > 0 && overrideDurNum > 0));

  const submit = () => {
    start(async () => {
      const res = await adminCreateBooking({
        serviceSlug: f.serviceSlug,
        postcode: f.postcode,
        rooms: f.rooms,
        condition: f.condition,
        frequency: f.frequency,
        slotStartISO: f.slotStartISO ? new Date(f.slotStartISO).toISOString() : "",
        paymentMethod: f.paymentMethod,
        source: f.source,
        contact: { name: f.name, email: f.email, phone: f.phone, addressLine1: f.addressLine1 },
        notes: f.notes,
        leadId: leadId ?? "",
        overridePricePence: isOverride ? overridePence : undefined,
        overrideReason: isOverride ? f.overrideReason : "",
        overrideDurationMinutes: f.overrideDuration ? Number(f.overrideDuration) : undefined,
      });
      setResult(res);
    });
  };

  if (result?.status === "success") {
    return (
      <div className="card max-w-lg p-6">
        <h2 className="text-lg font-bold">Booking created ✓</h2>
        <p className="mt-2">Reference <strong>{result.reference}</strong></p>
        <p className="mt-1 text-ink-soft">{result.message}</p>
        {result.paymentUrl && (
          <p className="mt-3 break-all text-sm">Payment link: <a className="text-brand-strong underline" href={result.paymentUrl}>{result.paymentUrl}</a></p>
        )}
        <button className="btn btn-outline mt-4" onClick={() => setResult(null)}>Create another</button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        {leadId && (
          <p className="rounded-lg border border-brand/40 bg-brand-tint/40 p-3 text-sm text-brand-ink">
            Converting a lead into a booking — this stamps the lead as converted and links it to the new quote.
          </p>
        )}
        <Row label="Service">
          <select className="input" value={f.serviceSlug} onChange={(e) => setF({ ...f, serviceSlug: e.target.value })}>
            {selfServeServices.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </Row>
        <Row label="Postcode">
          <input className="input" value={f.postcode} onChange={(e) => setF({ ...f, postcode: e.target.value.toUpperCase() })} />
        </Row>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Rooms</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROOM_KEYS.map((k) => (
              <label key={k} className="text-sm">
                {ROOM_LABELS[k]}
                <input type="number" min={0} max={20} className="input mt-1" value={f.rooms[k]}
                  onChange={(e) => setF({ ...f, rooms: { ...f.rooms, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Condition">
            <select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as typeof f.condition })}>
              <option value="standard">Standard</option>
              <option value="heavily_soiled">Heavily soiled</option>
            </select>
          </Row>
          <Row label="Frequency">
            <select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as typeof f.frequency })}>
              <option value="one_off">One-off</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Row>
        </div>
        <Row label="Scheduled start (optional)">
          <input type="datetime-local" className="input" value={f.slotStartISO} onChange={(e) => setF({ ...f, slotStartISO: e.target.value })} />
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Payment method">
            <select className="input" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value as typeof f.paymentMethod })}>
              <option value="payment_link">Payment link</option>
              <option value="invoice">Invoice</option>
            </select>
          </Row>
          <Row label="Source">
            <select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as typeof f.source })}>
              <option value="phone">Phone</option>
              <option value="admin">Admin</option>
              <option value="partner">Partner</option>
            </select>
          </Row>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Customer name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Row>
          <Row label="Email"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Row>
          <Row label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Row>
          <Row label="Address line 1"><input className="input" value={f.addressLine1} onChange={(e) => setF({ ...f, addressLine1: e.target.value })} /></Row>
        </div>
        <Row label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Row>

        {/* Manual price override (§9.7). Required when the job escalates (no engine
            price); optional otherwise to override the engine price. Recorded on the
            Quote as manualOverride + reason + who (server-side). */}
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-semibold">
            Manual price {overrideRequired ? <span className="text-error">(required — this job needs a bespoke quote)</span> : <span className="text-ink-soft">(optional override)</span>}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Price £ (inc. VAT)
              <input type="number" min={0} step="0.01" className="input mt-1" value={f.overridePrice}
                onChange={(e) => setF({ ...f, overridePrice: e.target.value })} />
            </label>
            <label className="text-sm">On-site minutes {isOverride && <span className="text-error">*</span>}
              <input type="number" min={1} className="input mt-1" value={f.overrideDuration}
                onChange={(e) => setF({ ...f, overrideDuration: e.target.value })} />
            </label>
            <label className="text-sm sm:col-span-3">Reason {isOverride && <span className="text-error">*</span>}
              <input className="input mt-1" placeholder="Why the price was set by hand" value={f.overrideReason}
                onChange={(e) => setF({ ...f, overrideReason: e.target.value })} />
            </label>
          </div>
        </fieldset>

        {result?.status === "error" && <p className="text-sm text-error" role="alert">{result.message}</p>}
        <button className="btn btn-primary" onClick={submit} disabled={pending || !canSubmit}>
          {pending ? "Creating…" : "Create booking"}
        </button>
      </div>

      <aside className="card h-fit p-5">
        <p className="eyebrow">{isOverride ? "Manual price" : "Estimate"}</p>
        {isOverride ? (
          <>
            <p className="mt-1 text-2xl font-bold">{formatPence(overridePence!)}</p>
            <p className="text-sm text-ink-soft">Bespoke, hand-set{f.overrideDuration ? ` · ${f.overrideDuration} min on site` : ""}</p>
            {quote.escalate && <p className="mt-1 text-xs text-ink-soft">Engine escalated — no automatic price.</p>}
          </>
        ) : quote.escalate ? (
          <p className="mt-1 text-sm text-ink-soft">Needs a manual price — {quote.reason}</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold">{formatPence(quote.chargeNow.gross)}</p>
            <p className="text-sm text-ink-soft">{quote.isRecurring ? "first visit" : "one-off"} · {quote.elapsedMinutes} min on site</p>
            {quote.isRecurring && <p className="mt-1 text-sm text-ink-soft">then {formatPence(quote.perVisitGross)}/visit</p>}
          </>
        )}
      </aside>

      <style>{`.input{width:100%;border:1px solid var(--color-line);background:var(--color-surface);border-radius:.5rem;padding:.55rem .6rem;font-size:.95rem}`}</style>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
