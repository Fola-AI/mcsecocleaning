import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireCrew } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { localDateString, localTimeString } from "@/lib/timezone";
import { label as statusLabel } from "@/lib/job-status";
import { CrewJobControls } from "@/components/crew/CrewJobControls";
import { AccessCodeReveal } from "@/components/crew/AccessCodeReveal";
import { CrewChecklist } from "@/components/crew/CrewChecklist";
import { groupItems } from "@/lib/checklist";
import { ensureChecklist } from "@/lib/checklist-db";

export const metadata: Metadata = { title: "Job", robots: { index: false, follow: false } };

/**
 * Job detail (§9.2): property, access, parking, pets, product preferences,
 * customer notes — and the two buttons that matter, clock in and clock out.
 *
 * The query is scoped by the crew member's own assignment, so asking for
 * another crew's job id returns nothing and the page 404s. That is the RBAC
 * test: not that the link is missing, but that the id does not work.
 *
 * `params` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 *
 * Access codes are revealed by `AccessCodeReveal`, which asks for them on
 * demand — this page never loads or renders one (§6.9).
 */
export default async function CrewJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: crewId } = await requireCrew();
  const { id } = await params;
  if (!hasDatabase) notFound();

  const job = await db.job.findFirst({
    where: { id, assignments: { some: { crewId } } },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      estimatedDurationMinutes: true,
      notes: true,
      serviceType: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      property: {
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          entryMethod: true,
          parkingNotes: true,
          pets: true,
          productPreferences: true,
          accessNotes: true,
          doNotTouch: true,
        },
      },
      timeEntries: {
        where: { crewId },
        orderBy: { clockInAt: "desc" },
        select: { id: true, clockInAt: true, clockOutAt: true, durationMinutes: true },
      },
      assignments: { select: { crew: { select: { name: true } }, isLead: true } },
      checklistItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          groupLabel: true,
          sortOrder: true,
          requiresPhoto: true,
          completed: true,
          mediaId: true,
        },
      },
    },
  });

  if (!job) notFound();

  // A job scheduled before L8 existed has no checklist. Rather than leave a crew
  // on a doorstep without one, it is created on first open — idempotent, so a
  // job that has one is untouched.
  let items = job.checklistItems;
  if (items.length === 0) {
    const added = await ensureChecklist(job.id);
    if (added > 0) {
      items = await db.jobChecklistItem.findMany({
        where: { jobId: job.id },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          groupLabel: true,
          sortOrder: true,
          requiresPhoto: true,
          completed: true,
          mediaId: true,
        },
      });
    }
  }

  // Media exchange (L7) is unbuilt — its R2 keys are not configured — so the
  // checklist says so for photo-required items instead of offering an upload
  // button that cannot work.
  const photoUploadAvailable = Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
  );

  const property = job.property;
  const address = [property?.addressLine1, property?.addressLine2, property?.city, property?.postcode]
    .filter(Boolean)
    .join(", ");
  const openEntry = job.timeEntries.find((entry) => entry.clockInAt && !entry.clockOutAt);
  const pets = asNotes(property?.pets);
  const products = asPreference(property?.productPreferences);

  return (
    <div>
      <Link href="/crew" className="text-sm text-brand-strong underline">
        ← Today
      </Link>

      <h1 className="mt-3 text-xl font-bold">{job.serviceType?.name ?? "Clean"}</h1>
      <p className="text-sm text-ink-soft">
        {job.scheduledStart
          ? `${localDateString(job.scheduledStart)} · ${localTimeString(job.scheduledStart)}`
          : "No time set"}
        {job.scheduledEnd ? `–${localTimeString(job.scheduledEnd)}` : ""} · {statusLabel(job.status)}
      </p>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Where</h2>
        <p className="mt-1 font-semibold">{address}</p>
        {/* No map key is configured, so a deep link rather than an embed — it
            opens whichever maps app the phone already uses, which is the one
            with their traffic and their preferences. */}
        <a
          className="btn btn-outline mt-3 w-full py-3"
          href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maps
        </a>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Getting in</h2>
        <ul className="mt-1 space-y-1 text-sm">
          <li>Entry: {property?.entryMethod?.replaceAll("_", " ") ?? "not recorded"}</li>
          {property?.accessNotes && <li>{property.accessNotes}</li>}
          {property?.parkingNotes && <li>Parking: {property.parkingNotes}</li>}
        </ul>
        {/* The codes themselves are NOT fetched here. This renders buttons; the
            code is decrypted only when one is pressed and returned to that one
            request, so it never enters this page's payload — which is cached by
            the router and included in error reports. */}
        <AccessCodeReveal jobId={job.id} />
      </section>

      {(pets || products || property?.doNotTouch || job.notes) && (
        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink-soft">What to know</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {pets && <li>Pets: {pets}</li>}
            {products && <li>Products: {products}</li>}
            {property?.doNotTouch && <li>Do not touch: {property.doNotTouch}</li>}
            {job.notes && <li>{job.notes}</li>}
          </ul>
        </section>
      )}

      {job.assignments.length > 1 && (
        <p className="mt-4 text-sm text-ink-soft">
          With you: {job.assignments.map((a) => a.crew?.name).filter(Boolean).join(", ")}
        </p>
      )}

      <CrewChecklist
        photoUploadAvailable={photoUploadAvailable}
        groups={groupItems(
          items.map((item) => ({
            id: item.id,
            label: item.label,
            groupLabel: item.groupLabel,
            sortOrder: item.sortOrder,
            requiresPhoto: item.requiresPhoto,
            completed: item.completed,
            hasPhoto: Boolean(item.mediaId),
          })),
        )}
      />

      <CrewJobControls
        jobId={job.id}
        status={job.status}
        clockedInAt={openEntry?.clockInAt?.toISOString() ?? null}
      />
    </div>
  );
}

/** `Property.pets` is Json: `{ notes }` from the wizard, or a list later. */
function asNotes(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const notes = (value as { notes?: unknown }).notes;
  return typeof notes === "string" && notes.trim() ? notes : null;
}

function asPreference(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const preference = (value as { preference?: unknown }).preference;
  return typeof preference === "string" && preference.trim() ? preference.replaceAll("_", " ") : null;
}
