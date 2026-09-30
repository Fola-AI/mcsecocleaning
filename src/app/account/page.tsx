import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer, signOut } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { MarketingToggle } from "@/components/account/MarketingToggle";
import { SubscriptionControls } from "@/components/account/SubscriptionControls";
import { PayOutstandingButton } from "@/components/account/PayOutstandingButton";

/** Rebook link — carries the property (rooms/type/postcode) + service, never a
 *  price; the wizard recomputes from the current rate card. */
function rebookHref(job: { serviceType: { slug: string } | null; property: { postcode: string | null; propertyType: string | null; roomCounts: unknown } | null }): string {
  const p = new URLSearchParams();
  if (job.serviceType?.slug) p.set("service", job.serviceType.slug);
  if (job.property?.postcode) p.set("postcode", job.property.postcode);
  if (job.property?.propertyType) p.set("propertyType", job.property.propertyType);
  if (job.property?.roomCounts) p.set("rooms", JSON.stringify(job.property.roomCounts));
  return `/book?${p.toString()}`;
}

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/account/signin" });
}

// A booking has an outstanding balance the customer can settle themselves.
const OUTSTANDING = new Set(["part_paid", "failed", "pending"]);

export default async function AccountPage() {
  // Ownership gate: `id` is the ONLY key used to scope reads below.
  const { id } = await requireCustomer();

  const [jobs, subscriptions, properties, me] = hasDatabase
    ? await Promise.all([
        db.job.findMany({
          where: { customerId: id },
          include: { serviceType: true, property: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        db.subscription.findMany({
          where: { customerId: id },
          include: { serviceType: true },
          orderBy: { createdAt: "desc" },
        }),
        db.property.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
        db.user.findUnique({ where: { id }, select: { marketingConsent: true } }),
      ])
    : [[], [], [], null];

  const outstanding = jobs.filter((j) => OUTSTANDING.has(j.paymentStatus));

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your account</h1>
        <form action={signOutAction}>
          <button className="text-sm text-ink-soft hover:text-ink">Sign out</button>
        </form>
      </div>

      {/* Outstanding balance — unmissable, one click to pay (the email just says
          "sign in", so the pay action must be front and centre when they land). */}
      {outstanding.length > 0 && (
        <div className="mt-6 rounded-lg border border-brand/50 bg-brand-tint/50 p-4">
          <p className="font-semibold text-brand-ink">You have a balance to pay</p>
          <div className="mt-3 space-y-2">
            {outstanding.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {j.serviceType?.name ?? "Clean"}{j.scheduledStart ? ` · ${localDateString(j.scheduledStart)}` : ""} — <strong>{formatPence(j.gross)}</strong>
                </span>
                <PayOutstandingButton jobId={j.id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Your recurring plan{subscriptions.length > 1 ? "s" : ""}</h2>
          <div className="mt-3 space-y-3">
            {subscriptions.map((s) => (
              <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{s.serviceType?.name ?? "Clean"}</p>
                  <p className="text-sm text-ink-soft">
                    {formatPence(s.gross)}/visit · <span className="capitalize">{s.status}</span>
                  </p>
                </div>
                <SubscriptionControls subscriptionId={s.id} status={s.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bookings */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Your bookings</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-ink-soft">No bookings yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {jobs.map((j) => (
              <div key={j.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{j.serviceType?.name ?? "Clean"}</p>
                  <p className="text-sm text-ink-soft">
                    {j.scheduledStart ? localDateString(j.scheduledStart) : "Date to be confirmed"} · {formatPence(j.gross)} ·{" "}
                    <span className="capitalize">{j.status}</span> · <span className="capitalize">{j.paymentStatus.replace("_", " ")}</span>
                  </p>
                </div>
                <Link href={rebookHref(j)} className="btn btn-outline">Book again</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved properties */}
      {properties.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Saved properties</h2>
          <div className="mt-3 space-y-3">
            {properties.map((p) => (
              <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{p.addressLine1}</p>
                  <p className="text-sm text-ink-soft">{p.postcode}</p>
                </div>
                <Link href={`/account/property/${p.id}`} className="btn btn-outline">Edit</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Marketing preferences */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Email &amp; SMS preferences</h2>
        <MarketingToggle initial={me?.marketingConsent ?? false} />
      </section>
    </div>
  );
}
