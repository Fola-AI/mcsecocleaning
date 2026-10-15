"use server";

import { z } from "zod";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { checkResolution, recleanWindow, remedyState } from "@/lib/remedy";
import { localDateString } from "@/lib/timezone";

/**
 * Issue resolution (§9.5, PRD §16.3 → L13).
 *
 * The three paths §9.5 names, and the rule running through all of them: the
 * remedy window changes what we **promise**, never whether we act. A re-clean
 * outside the window is allowed and recorded as goodwill; it is not refused.
 */

const OPS = ["owner", "admin", "supervisor"] as const;

/**
 * Create the zero-price re-clean (§9.5).
 *
 * **Zero price, linked to the original**, which is the acceptance criterion and
 * also what makes the books readable: a free re-clean that looks like a £78 job
 * with a 100% discount is a different thing to explain at year end than a job
 * that was always zero. `isRecleanForJobId` carries the link.
 *
 * Scheduled 24–48 hours out (§9.5). Sooner is rarely possible with a roster this
 * size; later and the customer has already told somebody else about it.
 */
export async function scheduleReclean(
  jobId: string,
  input: { issueId?: string; when?: string; note?: string } = {},
): Promise<{ ok: boolean; message: string; recleanJobId?: string }> {
  const { id: actorId } = await requireRole([...OPS]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const original = await db.job.findUnique({
    where: { id: jobId },
    include: { serviceType: { select: { slug: true, name: true } } },
  });
  if (!original) return { ok: false, message: "Job not found." };
  if (!original.serviceType) return { ok: false, message: "That job has no service type." };

  const existing = await db.job.findFirst({ where: { isRecleanForJobId: jobId } });
  if (existing) {
    return { ok: false, message: "A re-clean is already booked for that job." };
  }

  const standing = remedyState(
    original.serviceType.slug,
    original.scheduledStart ?? original.createdAt,
  ).standing;
  const verdict = checkResolution("reclean", { standing });
  if (!verdict.ok) return { ok: false, message: verdict.reason! };

  const window = recleanWindow();
  const when = input.when ? new Date(input.when) : window.earliest;
  if (Number.isNaN(when.getTime())) return { ok: false, message: "That date doesn't look right." };

  const reclean = await db.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        customerId: original.customerId,
        propertyId: original.propertyId,
        serviceTypeId: original.serviceTypeId,
        status: "scheduled",
        scheduledStart: when,
        scheduledEnd: new Date(when.getTime() + original.estimatedDurationMinutes * 60_000),
        estimatedDurationMinutes: original.estimatedDurationMinutes,
        // Zero, not discounted. A free re-clean that reads as a full-price job
        // with a 100% discount is a different thing to explain at year end.
        net: 0,
        vatRate: 0,
        vatAmount: 0,
        gross: 0,
        paymentStatus: "captured",
        source: "admin",
        isRecleanForJobId: original.id,
        notes:
          `Free re-clean of ${localDateString(original.scheduledStart ?? original.createdAt)}` +
          `${standing === "support" ? " (goodwill — outside the guarantee window)" : " (re-clean guarantee)"}.` +
          (input.note ? ` ${input.note}` : ""),
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: created.id,
        toStatus: "scheduled",
        actorId,
        note: `Zero-price re-clean for job ${original.id}.`,
      },
    });
    await tx.jobStatusEvent.create({
      data: {
        jobId: original.id,
        toStatus: original.status,
        actorId,
        note: `Re-clean booked for ${localDateString(when)} (job ${created.id}).`,
      },
    });

    if (input.issueId) {
      await tx.issueThread.update({
        where: { id: input.issueId },
        data: { resolution: "reclean", resolutionJobId: created.id, status: "resolved", resolvedAt: new Date() },
      });
    }

    return created;
  });

  return {
    ok: true,
    message: `Free re-clean booked for ${localDateString(when)}.`,
    recleanJobId: reclean.id,
  };
}

const resolveSchema = z.object({
  issueId: z.string().min(1),
  resolution: z.enum(["partial_refund", "explanation"]),
  reason: z.string().trim().min(3).max(1000),
});

/**
 * Close an issue with a refund or an explanation (§9.5).
 *
 * Both require a reason, recorded on the thread. "Refunded £20" with no reason
 * is worthless three months later when somebody asks why the takings do not
 * match — and an explanation nobody wrote down is not a resolution, it is a
 * conversation that happened once.
 */
export async function resolveIssue(
  input: z.input<typeof resolveSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS]);
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const verdict = checkResolution(parsed.data.resolution, {
    standing: "support",
    reason: parsed.data.reason,
  });
  if (!verdict.ok) return { ok: false, message: verdict.reason! };

  await db.$transaction(async (tx) => {
    await tx.issueThread.update({
      where: { id: parsed.data.issueId },
      data: {
        // The schema's enum calls it `refund`; §9.5 calls it a partial refund.
        // Mapped here rather than renaming the enum, which would be a migration
        // for a word.
        resolution: parsed.data.resolution === "partial_refund" ? "refund" : "explanation",
        status: "resolved",
        resolvedAt: new Date(),
      },
    });
    await tx.issueMessage.create({
      data: {
        threadId: parsed.data.issueId,
        authorId: actorId,
        authorRole: "admin",
        body: `Resolved — ${parsed.data.resolution.replace("_", " ")}: ${parsed.data.reason}`,
      },
    });
  });

  // The money itself is not moved here. A refund is a payment action with its
  // own guards and its own Stripe call (§6.2, schedule ≠ billing); recording the
  // decision and taking the money are deliberately two steps.
  return {
    ok: true,
    message:
      parsed.data.resolution === "partial_refund"
        ? "Recorded. Process the refund from the payments queue — this records the decision, not the money."
        : "Recorded on the thread.",
  };
}

/** Flag an issue's urgency by hand (§9.5 triage). */
export async function setIssueUrgency(
  issueId: string,
  urgency: "low" | "normal" | "high",
): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  // Manual, not inferred. An automatic sentiment score over a handful of
  // messages is a guess presented as a fact, which §11 rejects for the same
  // reason on larger datasets.
  await db.issueThread.update({ where: { id: issueId }, data: { urgency } });
  return { ok: true, message: `Marked ${urgency} priority.` };
}
