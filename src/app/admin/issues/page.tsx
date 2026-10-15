import Link from "next/link";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { localDateString } from "@/lib/timezone";
import { remedyState } from "@/lib/remedy";
import { IssueControls } from "@/components/admin/IssueControls";

export const metadata: Metadata = { title: "Issues", robots: { index: false, follow: false } };

/**
 * Issue triage (§9.5).
 *
 * Open threads first, oldest first — a complaint that has been sitting for three
 * days is the one that becomes a public review. Each row says whether the job is
 * still inside its remedy window, because that changes what we are promising,
 * **not** whether we act: an elapsed window converts the thread to ordinary
 * support and never locks it.
 *
 * Damage claims are separated out. They are handled differently (evidence,
 * possibly an insurer) and retained differently from a complaint.
 */
export default async function AdminIssuesPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const threads = hasDatabase
    ? await db.issueThread.findMany({
        orderBy: [{ status: "asc" }, { openedAt: "asc" }],
        take: 100,
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          job: {
            select: {
              id: true,
              scheduledStart: true,
              createdAt: true,
              customer: { select: { name: true, email: true } },
              serviceType: { select: { name: true, slug: true } },
            },
          },
        },
      })
    : [];

  const damage = threads.filter((thread) => thread.type === "damage_claim");
  const other = threads.filter((thread) => thread.type !== "damage_claim");

  return (
    <AdminShell title="Issues">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">No database connected.</p>
      )}

      {threads.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          Nothing raised. Crews report problems from the job, and customers from their account.
        </p>
      )}

      {damage.length > 0 && (
        <section className="mb-8">
          <h2 className="font-bold">Damage and breakage</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Handled separately: these may involve an insurer, and the evidence pack matters.
          </p>
          <div className="mt-3 space-y-3">
            {damage.map((thread) => (
              <IssueCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="font-bold">Complaints and requests</h2>
          <div className="mt-3 space-y-3">
            {other.map((thread) => (
              <IssueCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      )}
    </AdminShell>
  );
}

type Thread = {
  id: string;
  type: string;
  status: string;
  urgency: string | null;
  openedAt: Date;
  resolution: string | null;
  messages: { id: string; body: string; createdAt: Date; authorRole: string }[];
  job: {
    id: string;
    scheduledStart: Date | null;
    createdAt: Date;
    customer: { name: string | null; email: string } | null;
    serviceType: { name: string; slug: string } | null;
  } | null;
};

function IssueCard({ thread }: { thread: Thread }) {
  const completedAt = thread.job?.scheduledStart ?? thread.job?.createdAt ?? thread.openedAt;
  const state = thread.job?.serviceType
    ? remedyState(thread.job.serviceType.slug, completedAt)
    : null;

  return (
    <article
      className={`rounded-lg border p-4 ${
        thread.status === "open" ? "border-accent/40 bg-accent/5" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{thread.type.replaceAll("_", " ")}</span>
        <span className="text-sm text-ink-soft">
          {thread.job?.customer?.name ?? thread.job?.customer?.email ?? "—"} ·{" "}
          {thread.job?.serviceType?.name ?? "clean"} ·{" "}
          {thread.job?.scheduledStart ? localDateString(thread.job.scheduledStart) : "no date"}
        </span>
        <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs">{thread.status}</span>
        {thread.urgency && thread.urgency !== "normal" && (
          <span className="rounded-full bg-error/10 px-2 py-0.5 text-xs text-error">{thread.urgency} priority</span>
        )}
        {state && (
          <span className="text-xs text-ink-soft">
            {state.standing === "guaranteed"
              ? `guarantee window: ${state.hoursRemaining}h left`
              : "outside the guarantee window — still ours to answer"}
          </span>
        )}
        {thread.job && (
          <Link href={`/admin/jobs/${thread.job.id}`} className="ml-auto text-sm text-brand-strong underline">
            Open the job
          </Link>
        )}
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {thread.messages.map((message) => (
          <li key={message.id}>
            <span className="text-xs text-ink-soft">
              {message.authorRole} · {localDateString(message.createdAt)}:{" "}
            </span>
            {message.body}
          </li>
        ))}
      </ul>

      {thread.status !== "resolved" && thread.job && (
        <IssueControls issueId={thread.id} jobId={thread.job.id} />
      )}
      {thread.resolution && (
        <p className="mt-2 text-sm text-ink-soft">Resolved — {thread.resolution.replaceAll("_", " ")}.</p>
      )}
    </article>
  );
}
