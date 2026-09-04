"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { selfServeServices, addOns as allAddOns } from "@/config/services";
import { ROOM_KEYS, type RoomKey } from "@/config/pricing";
import { computeQuote, type Frequency, type Condition } from "@/lib/quote";
import { formatPence, formatPounds } from "@/lib/money";
import { checkServiceArea } from "@/lib/serviceArea";
import { getSlots, createBooking, type BookingResult } from "@/app/actions/booking";
import { CCR_CONSENT } from "@/config/legal";

const ROOM_LABELS: Record<RoomKey, string> = {
  kitchens: "Kitchens",
  bathrooms: "Bathrooms / WCs",
  receptions: "Reception rooms",
  bedrooms: "Bedrooms",
  hallways: "Hallways",
  studies: "Studies",
  conservatories: "Conservatories",
};

const FREQUENCIES: { value: Frequency; label: string; note: string }[] = [
  { value: "one_off", label: "One-off", note: "A single visit" },
  { value: "weekly", label: "Weekly", note: "Best value per visit" },
  { value: "fortnightly", label: "Fortnightly", note: "Most popular" },
  { value: "monthly", label: "Monthly", note: "Light-touch upkeep" },
];

interface State {
  postcode: string;
  serviceSlug: string;
  rooms: Record<RoomKey, number>;
  condition: Condition;
  propertyType: string;
  frequency: Frequency;
  addOnSlugs: string[];
  slotStartISO: string;
  access: { entryMethod: string; parking: string; pets: string; productPreference: string; instructions: string };
  contact: { name: string; email: string; phone: string; addressLine1: string };
  ccrConsent: boolean;
  marketingConsent: boolean;
}

const emptyRooms = Object.fromEntries(ROOM_KEYS.map((k) => [k, 0])) as Record<RoomKey, number>;

const STEP_TITLES = [
  "Your area",
  "Service",
  "Your property",
  "Frequency",
  "Add-ons",
  "Date & time",
  "Access",
  "Your details",
];

export function BookingWizard({
  initialService,
  initialPostcode,
}: {
  initialService?: string;
  initialPostcode?: string;
}) {
  const areaOk = initialPostcode ? checkServiceArea(initialPostcode).inArea : false;
  const [step, setStep] = useState(areaOk ? (initialService ? 2 : 1) : 0);
  const [state, setState] = useState<State>({
    postcode: initialPostcode ?? "",
    serviceSlug: initialService && selfServeServices.some((s) => s.slug === initialService) ? initialService : selfServeServices[0].slug,
    rooms: { ...emptyRooms, kitchens: 1, bathrooms: 1, bedrooms: 1, receptions: 1 },
    condition: "standard",
    propertyType: "flat",
    frequency: "one_off",
    addOnSlugs: [],
    slotStartISO: "",
    access: { entryMethod: "client_present", parking: "", pets: "", productPreference: "standard", instructions: "" },
    contact: { name: "", email: "", phone: "", addressLine1: "" },
    ccrConsent: false,
    marketingConsent: false,
  });
  const [result, setResult] = useState<BookingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof State>(key: K, value: State[K]) => setState((s) => ({ ...s, [key]: value }));

  const quote = useMemo(
    () =>
      computeQuote({
        serviceSlug: state.serviceSlug,
        rooms: state.rooms,
        condition: state.condition,
        frequency: state.frequency,
        addOnSlugs: state.addOnSlugs,
        regionKey: "london",
      }),
    [state.serviceSlug, state.rooms, state.condition, state.frequency, state.addOnSlugs]
  );

  const areaCheck = state.postcode ? checkServiceArea(state.postcode) : null;
  const applicableAddOns = allAddOns.filter((a) => a.appliesTo.includes(state.serviceSlug));

  if (result?.status === "success") return <Confirmation result={result} />;

  const canNext = (): boolean => {
    switch (step) {
      case 0: return Boolean(areaCheck?.inArea);
      case 2: return ROOM_KEYS.some((k) => state.rooms[k] > 0);
      case 5: return Boolean(state.slotStartISO);
      case 7: return Boolean(state.contact.name && state.contact.email && state.ccrConsent);
      default: return true;
    }
  };

  const submit = () => {
    startTransition(async () => {
      const res = await createBooking({
        serviceSlug: state.serviceSlug,
        postcode: state.postcode,
        rooms: state.rooms,
        condition: state.condition,
        propertyType: state.propertyType,
        frequency: state.frequency,
        addOnSlugs: state.addOnSlugs,
        slotStartISO: state.slotStartISO || undefined,
        access: state.access,
        contact: state.contact,
        ccrConsent: state.ccrConsent as true,
        marketingConsent: state.marketingConsent,
      });
      setResult(res);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        {/* Progress */}
        <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Booking steps">
          {STEP_TITLES.map((t, i) => (
            <li
              key={t}
              className={`h-1.5 flex-1 min-w-8 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`}
              aria-current={i === step ? "step" : undefined}
            />
          ))}
        </ol>
        <p className="eyebrow">Step {step + 1} of {STEP_TITLES.length}</p>
        <h2 className="mt-1 text-2xl font-bold">{STEP_TITLES[step]}</h2>

        <div className="mt-5">
          {step === 0 && <StepArea state={state} set={set} areaCheck={areaCheck} />}
          {step === 1 && <StepService state={state} set={set} />}
          {step === 2 && <StepProperty state={state} set={set} />}
          {step === 3 && <StepFrequency state={state} set={set} quote={quote} />}
          {step === 4 && <StepAddOns state={state} set={set} addOns={applicableAddOns} />}
          {step === 5 && <StepSlot state={state} set={set} durationMinutes={quote.durationMinutes} />}
          {step === 6 && <StepAccess state={state} set={set} />}
          {step === 7 && <StepDetails state={state} set={set} quote={quote} result={result} />}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            className="btn btn-outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          {step < STEP_TITLES.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={!canNext() || pending}>
              {pending ? "Booking…" : "Confirm booking"}
            </button>
          )}
        </div>
        {result?.status === "error" && (
          <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert">
            {result.message}
          </p>
        )}
      </div>

      <PriceSummary state={state} quote={quote} />
    </div>
  );
}

// ---------------- Steps ----------------

type StepProps = {
  state: State;
  set: <K extends keyof State>(key: K, value: State[K]) => void;
};

function StepArea({ state, set, areaCheck }: StepProps & { areaCheck: ReturnType<typeof checkServiceArea> | null }) {
  return (
    <div>
      <label htmlFor="bw-postcode" className="block text-sm font-semibold">Enter your postcode</label>
      <input
        id="bw-postcode"
        className="mt-1 w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-3 text-base"
        placeholder="e.g. SW4 7AA"
        autoCapitalize="characters"
        value={state.postcode}
        onChange={(e) => set("postcode", e.target.value)}
      />
      <div aria-live="polite" className="mt-3 text-sm">
        {areaCheck?.valid && areaCheck.inArea && <p className="text-success">✓ We cover {areaCheck.areaName}.</p>}
        {areaCheck?.valid && !areaCheck.inArea && (
          <p className="text-ink-soft">
            We&apos;re not in {areaCheck.outward} yet.{" "}
            <Link href={`/areas-we-cover?waitlist=1&postcode=${areaCheck.outward}`} className="underline text-brand-strong">
              Join the waitlist
            </Link>
            .
          </p>
        )}
        {state.postcode && !areaCheck?.valid && <p className="text-error">Please enter a valid UK postcode.</p>}
      </div>
    </div>
  );
}

function StepService({ state, set }: StepProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {selfServeServices.map((s) => (
        <button
          key={s.slug}
          onClick={() => set("serviceSlug", s.slug)}
          className={`card p-4 text-left ${state.serviceSlug === s.slug ? "ring-2 ring-brand" : ""}`}
          aria-pressed={state.serviceSlug === s.slug}
        >
          <span className="font-semibold">{s.name}</span>
          <span className="mt-1 block text-sm text-ink-soft">{s.tagline}</span>
        </button>
      ))}
    </div>
  );
}

function StepProperty({ state, set }: StepProps) {
  const setRoom = (k: RoomKey, v: number) => set("rooms", { ...state.rooms, [k]: Math.max(0, v) });
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {ROOM_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between">
            <span>{ROOM_LABELS[k]}</span>
            <Stepper value={state.rooms[k]} onChange={(v) => setRoom(k, v)} label={ROOM_LABELS[k]} />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-sm font-semibold">Property condition</label>
        <div className="mt-2 flex gap-2">
          {(["standard", "heavily_soiled"] as Condition[]).map((c) => (
            <button
              key={c}
              onClick={() => set("condition", c)}
              className={`rounded-full border px-4 py-2 text-sm ${state.condition === c ? "border-brand bg-brand-tint text-brand-ink" : "border-line"}`}
            >
              {c === "standard" ? "Standard" : "Heavily soiled"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepFrequency({ state, set, quote }: StepProps & { quote: ReturnType<typeof computeQuote> }) {
  return (
    <div className="space-y-2">
      {FREQUENCIES.map((f) => {
        const q = computeQuote({ serviceSlug: state.serviceSlug, rooms: state.rooms, condition: state.condition, frequency: f.value, addOnSlugs: state.addOnSlugs });
        const selected = state.frequency === f.value;
        return (
          <button
            key={f.value}
            onClick={() => set("frequency", f.value)}
            className={`card flex w-full items-center justify-between p-4 text-left ${selected ? "ring-2 ring-brand" : ""}`}
            aria-pressed={selected}
          >
            <span>
              <span className="font-semibold">{f.label}</span>
              <span className="block text-sm text-ink-soft">{f.note}</span>
            </span>
            <span className="text-right">
              <span className="font-semibold">{formatPounds(q.isRecurring ? q.perVisitGross : q.oneOffGross)}</span>
              <span className="block text-xs text-ink-soft">{q.isRecurring ? "per visit" : "one-off"}</span>
              {q.isRecurring && q.frequencySavingPerVisit > 0 && (
                <span className="block text-xs font-semibold text-brand">Save {formatPounds(q.frequencySavingPerVisit)}/visit</span>
              )}
            </span>
          </button>
        );
      })}
      {quote.isRecurring && (
        <p className="mt-2 text-sm text-ink-soft">
          Your first visit is {formatPence(quote.firstVisitGross)} — a new home takes longer to bring to baseline.
        </p>
      )}
    </div>
  );
}

function StepAddOns({ state, set, addOns }: StepProps & { addOns: typeof allAddOns }) {
  const toggle = (slug: string) =>
    set("addOnSlugs", state.addOnSlugs.includes(slug) ? state.addOnSlugs.filter((s) => s !== slug) : [...state.addOnSlugs, slug]);
  if (addOns.length === 0) return <p className="text-ink-soft">No add-ons for this service.</p>;
  return (
    <div className="space-y-2">
      {addOns.map((a) => (
        <label key={a.slug} className={`card flex cursor-pointer items-center justify-between p-4 ${state.addOnSlugs.includes(a.slug) ? "ring-2 ring-brand" : ""}`}>
          <span className="flex items-center gap-3">
            <input type="checkbox" checked={state.addOnSlugs.includes(a.slug)} onChange={() => toggle(a.slug)} />
            <span>
              <span className="font-semibold">{a.name}</span>
              <span className="block text-xs text-ink-soft">+{a.durationMinutes} min</span>
            </span>
          </span>
          <span className="font-semibold text-brand-strong">
            {a.fromPricePence != null ? `+${formatPounds(a.fromPricePence)}` : "Quoted"}
          </span>
        </label>
      ))}
    </div>
  );
}

function StepSlot({ state, set, durationMinutes }: StepProps & { durationMinutes: number }) {
  const [slotData, setSlotData] = useState<{ forDuration: number; slots: Record<string, string[]> } | null>(null);

  useEffect(() => {
    let active = true;
    getSlots(durationMinutes).then((s) => {
      if (active) setSlotData({ forDuration: durationMinutes, slots: s });
    });
    return () => {
      active = false;
    };
  }, [durationMinutes]);

  const loading = !slotData || slotData.forDuration !== durationMinutes;
  const slots = slotData?.slots ?? null;

  if (loading || !slots) return <p className="text-ink-soft">Finding available times…</p>;
  const dates = Object.keys(slots).slice(0, 14);
  if (dates.length === 0) return <p className="text-ink-soft">No slots available in the next few weeks — please call us and we&apos;ll fit you in.</p>;

  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <div key={date}>
          <p className="text-sm font-semibold">{fmtDate(date)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots[date].slice(0, 12).map((time) => {
              const iso = new Date(`${date}T${time}:00`).toISOString();
              const selected = state.slotStartISO === iso;
              return (
                <button
                  key={time}
                  onClick={() => set("slotStartISO", iso)}
                  className={`rounded-lg border px-3 py-2 text-sm ${selected ? "border-brand bg-brand text-white" : "border-line hover:border-brand"}`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepAccess({ state, set }: StepProps) {
  const a = state.access;
  const upd = (patch: Partial<State["access"]>) => set("access", { ...a, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold">How will we get in?</label>
        <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5" value={a.entryMethod} onChange={(e) => upd({ entryMethod: e.target.value })}>
          <option value="client_present">I&apos;ll be home</option>
          <option value="key_held">You hold a key</option>
          <option value="lockbox">Lockbox / key safe</option>
          <option value="concierge">Concierge</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-semibold">Product preference</label>
        <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5" value={a.productPreference} onChange={(e) => upd({ productPreference: e.target.value })}>
          <option value="standard">Standard eco products</option>
          <option value="fragrance_free">Fragrance-free</option>
          <option value="allergy_sensitive">Allergy-sensitive</option>
          <option value="pet_safe">Extra pet-safe</option>
        </select>
      </div>
      <Textarea label="Parking notes" value={a.parking} onChange={(v) => upd({ parking: v })} />
      <Textarea label="Pets (name, type, temperament)" value={a.pets} onChange={(v) => upd({ pets: v })} />
      <Textarea label="Anything else we should know?" value={a.instructions} onChange={(v) => upd({ instructions: v })} />
    </div>
  );
}

function StepDetails({ state, set, quote, result }: StepProps & { quote: ReturnType<typeof computeQuote>; result: BookingResult | null }) {
  const c = state.contact;
  const upd = (patch: Partial<State["contact"]>) => set("contact", { ...c, ...patch });
  const err = (k: string) => (result?.status === "error" ? result.fieldErrors?.[k] : undefined);
  return (
    <div className="space-y-4">
      <Input label="Full name" value={c.name} onChange={(v) => upd({ name: v })} required error={err("contact.name")} />
      <Input label="Email" type="email" value={c.email} onChange={(v) => upd({ email: v })} required error={err("contact.email")} />
      <Input label="Phone" type="tel" value={c.phone} onChange={(v) => upd({ phone: v })} />
      <Input label="Address line 1" value={c.addressLine1} onChange={(v) => upd({ addressLine1: v })} />

      <label className="flex items-start gap-2 rounded-lg border border-brand/40 bg-brand-tint/40 p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={state.ccrConsent} onChange={(e) => set("ccrConsent", e.target.checked)} />
        <span>{CCR_CONSENT.text}</span>
      </label>

      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" className="mt-1" checked={state.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
        <span>Email me occasional offers and cleaning tips. Unsubscribe any time.</span>
      </label>

      <p className="text-sm text-ink-soft">
        You&apos;ll pay {formatPence(quote.chargeNow.gross)} for your {quote.isRecurring ? "first visit" : "clean"}. We authorise your card at booking and take payment on completion — the price only changes if you ask for extra work.
      </p>
    </div>
  );
}

// ---------------- Shared UI ----------------

function PriceSummary({ state, quote }: { state: State; quote: ReturnType<typeof computeQuote> }) {
  return (
    <aside className="lg:sticky lg:top-24 h-fit card p-5">
      <p className="eyebrow">Your price</p>
      <p className="mt-1 text-3xl font-bold">
        {formatPounds(quote.isRecurring ? quote.perVisitGross : quote.oneOffGross)}
        <span className="text-base font-medium text-ink-soft"> {quote.isRecurring ? "/visit" : ""}</span>
      </p>
      {quote.isRecurring && (
        <p className="text-sm text-ink-soft">First visit {formatPence(quote.firstVisitGross)}</p>
      )}
      <dl className="mt-4 space-y-1 text-sm text-ink-soft">
        <div className="flex justify-between"><dt>Service</dt><dd className="text-ink">{selfServeServices.find((s) => s.slug === state.serviceSlug)?.shortName}</dd></div>
        <div className="flex justify-between"><dt>Frequency</dt><dd className="text-ink capitalize">{state.frequency.replace("_", "-")}</dd></div>
        <div className="flex justify-between"><dt>Est. duration</dt><dd className="text-ink">{quote.durationMinutes} min</dd></div>
        {quote.minimumApplied && <p className="text-xs">Minimum job value applied.</p>}
      </dl>
      <p className="mt-4 text-xs text-ink-soft">Prices VAT-inclusive. No card needed to see your price.</p>
    </aside>
  );
}

function Confirmation({ result }: { result: Extract<BookingResult, { status: "success" }> }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="text-4xl" aria-hidden>🎉</div>
      <h2 className="mt-3 text-2xl font-bold">Booking received</h2>
      <p className="mt-1 text-ink-soft">{result.message}</p>
      <p className="mt-4 rounded-lg bg-brand-tint px-4 py-3 font-semibold text-brand-ink">Reference {result.reference}</p>
      {result.requiresPayment && (
        <p className="mt-4 text-sm text-ink-soft">
          {/* TODO(Phase 2 payment UI): mount Stripe Elements with the returned clientSecret to authorise the card. */}
          Complete payment to confirm — we&apos;ll email you a secure link.
        </p>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        We&apos;ve emailed your pre-contract information and reference. We&apos;ll be in touch to confirm your slot.
      </p>
      <Link href="/" className="btn btn-outline mt-6">Back to home</Link>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-3">
      <button aria-label={`Decrease ${label}`} className="h-9 w-9 rounded-full border border-line text-lg" onClick={() => onChange(value - 1)}>–</button>
      <span className="w-6 text-center font-semibold" aria-live="polite">{value}</span>
      <button aria-label={`Increase ${label}`} className="h-9 w-9 rounded-full border border-line text-lg" onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

function Input({ label, value, onChange, type = "text", required, error }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold">{label} {required && <span className="text-error">*</span>}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5" />
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5" />
    </div>
  );
}
