import Link from "next/link";
import type { Metadata } from "next";

import { requireCrew } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { localDateString, localTimeString } from "@/lib/timezone";
import { label as statusLabel } from "@/lib/job-status";
import { CrewSignOutButton } from "@/components/crew/CrewSignOutButton";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };

/**
 * Today's jobs (§9.2).
 *
 * Ordered by schedule, because that is the order the day happens in. The query
 * is scoped to the signed-in crew member's own assignments — a crew does not see
 * the diary, another crew's day, or anything unassigned. That is enforced here,
 * in the `where`, not by what the page chooses to render.
 *
 * No prices anywhere on the crew app: a crew member does not need the figure and
 * showing it on a doorstep is how a conversation about money starts with someone
 * who cannot settle it.
 */
export default async function CrewTodayPage() {
  const { id: crewId } = await requireCrew();

  const now = new Date();
  const today = localDateString(now);
  const jobs = hasDatabase
    ? await db.job.findMany({
        where: {
          assignments: { some: { crewId } },
          status: { notIn: ["cancelled", "draft"] },
          scheduledStart: {
            gte: new Date(`${today}T00:00:00Z`),
            lte: new Date(`${today}T23:59:59Z`),
          },
        },
        orderBy: { scheduledStart: "asc" },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          serviceType: { select: { name: true } },
          property: { select: { addressLine1: true, postcode: true } },
          timeEntries: { where: { crewId }, select: { clockInAt: true, clockOutAt: true } },
        },
      })
    : [];

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-sm text-ink-soft">
            {new Intl.DateTimeFormat("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Europe/London",
            }).format(now)}
          </p>
        </div>
        <CrewSignOutButton />
      </header>

      {jobs.length === 0 && (
        <p className="mt-8 rounded-lg border border-line bg-surface px-4 py-8 text-center text-ink-soft">
          Nothing on your list today. If you think that is wrong, ring the office.
        </p>
      )}

      <ol className="mt-5 space-y-3">
        {jobs.map((job) => {
          const open = job.timeEntries.find((entry) => entry.clockInAt && !entry.clockOutAt);
          return (
            <li key={job.id}>
              <Link
                href={`/crew/jobs/${job.id}`}
                className="block rounded-lg border border-line bg-surface p-4 active:bg-brand-tint/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-lg font-bold">
                    {job.scheduledStart ? localTimeString(job.scheduledStart) : "—"}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                    {open ? "On site" : statusLabel(job.status)}
                  </span>
                </div>
                <p className="mt-1 font-semibold">{job.property?.addressLine1}</p>
                <p className="text-sm text-ink-soft">
                  {job.property?.postcode} · {job.serviceType?.name ?? "Clean"}
                </p>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
