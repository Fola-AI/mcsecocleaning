import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { checkExpiry, worstState, type ComplianceState } from "@/lib/compliance";
import { availabilityConfig } from "@/config/availability";
import { localDateString } from "@/lib/timezone";

export const metadata: Metadata = { title: "Crew", robots: { index: false, follow: false } };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Crew roster (§9.7: "crew roster with DBS and insurance expiry warnings").
 *
 * Ordered so that anything needing attention is at the top — an expired DBS or
 * an unrecorded one is not a detail to scroll for. An unrecorded expiry is
 * treated as worse than one that is merely running out, because it looks fine
 * and means nobody has checked.
 */
export default async function AdminCrewPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const now = new Date();
  const crews = hasDatabase
    ? await db.crewProfile.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          unavailability: {
            where: { endsAt: { gte: now } },
            orderBy: { startsAt: "asc" },
            take: 3,
          },
        },
      })
    : [];

  const rows = crews
    .map((crew) => {
      const dbs = checkExpiry(crew.dbsExpiresAt, "DBS", now);
      const insurance = checkExpiry(crew.insuranceExpiresAt, "Insurance", now);
      return { crew, dbs, insurance, state: worstState([dbs, insurance]) };
    })
    .sort((a, b) => rank(a.state) - rank(b.state));

  return (
    <AdminShell title="Crew">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — there is no roster to read.
        </p>
      )}

      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        Jobs are currently <strong>{availabilityConfig.assignmentMode === "offer" ? "offered" : "assigned"}</strong> to
        crews (SETUP D2). Working hours here are what the booking wizard offers customers — a crew with no hours
        recorded offers no slots.
      </p>

      {hasDatabase && rows.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          No crew on the roster yet. Until there is, the booking wizard falls back to the placeholder roster in{" "}
          <code>src/config/availability.ts</code> so customers can still book.
        </p>
      )}

      <div className="space-y-3">
        {rows.map(({ crew, dbs, insurance, state }) => (
          <article key={crew.id} className={`rounded-lg border p-4 ${borderFor(state)}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{crew.user.name ?? crew.user.email}</span>
              {crew.user.phone && <span className="text-sm text-ink-soft">{crew.user.phone}</span>}
              <span className="text-sm text-ink-soft">
                {crew.payType} · {(crew.payRate / 100).toFixed(2)}
                {crew.payType === "hourly" ? "/hour" : crew.payType === "per_job" ? "/job" : "%"}
              </span>
              {state !== "ok" && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${chipFor(state)}`}>
                  {state === "expired" ? "Action needed" : state === "unknown" ? "Not recorded" : "Expiring"}
                </span>
              )}
            </div>

            <ul className="mt-2 space-y-0.5 text-sm">
              <li className={textFor(dbs.state)}>{dbs.message}</li>
              <li className={textFor(insurance.state)}>{insurance.message}</li>
            </ul>

            <p className="mt-2 text-sm text-ink-soft">
              Works:{" "}
              {Object.entries((crew.workingHours as Record<string, { start: string; end: string }[]>) ?? {})
                .map(([day, windows]) => `${WEEKDAYS[Number(day)]} ${windows.map((w) => `${w.start}–${w.end}`).join(", ")}`)
                .join(" · ") || "no hours recorded — offers no slots"}
            </p>

            {crew.unavailability.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                Time off:{" "}
                {crew.unavailability
                  .map((off) => `${localDateString(off.startsAt)}–${localDateString(off.endsAt)}${off.reason ? ` (${off.reason})` : ""}`)
                  .join(" · ")}
              </p>
            )}
          </article>
        ))}
      </div>
    </AdminShell>
  );
}

function rank(state: ComplianceState): number {
  return { expired: 0, unknown: 1, expiring: 2, ok: 3 }[state];
}

function borderFor(state: ComplianceState): string {
  if (state === "expired") return "border-error/40 bg-error/5";
  if (state === "unknown" || state === "expiring") return "border-accent/40 bg-accent/5";
  return "border-line";
}

function chipFor(state: ComplianceState): string {
  return state === "expired" ? "bg-error/10 text-error" : "bg-accent/10 text-accent-strong";
}

function textFor(state: ComplianceState): string {
  if (state === "expired") return "text-error";
  if (state === "unknown" || state === "expiring") return "text-accent-strong";
  return "text-ink-soft";
}
