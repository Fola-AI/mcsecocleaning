/**
 * Writing a job's checklist (§9.6, PRD §16.3 → L8).
 *
 * Server-only, and deliberately thin: the decisions live in
 * `src/lib/checklist.ts` where they can be tested without a database. This is
 * the part that touches rows.
 */

import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { templateForService } from "@/config/checklists";
import { snapshotItems } from "@/lib/checklist";

/**
 * Copy the service's checklist onto a job, once.
 *
 * Called when a job is scheduled, and again defensively when a crew opens a job
 * that has none — a job created before this existed, or one scheduled by a path
 * that predates it, should not leave a crew with no checklist on a doorstep.
 *
 * Idempotent by count: a job that already has items is left alone. Comparing
 * item by item would be worse, not better — it would silently "fix" a checklist
 * someone has already started completing, which is exactly the evidence §9.6
 * says must not move under them.
 */
export async function ensureChecklist(jobId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const client = tx ?? db;

  const job = await client.job.findUnique({
    where: { id: jobId },
    select: { id: true, serviceType: { select: { slug: true } } },
  });
  if (!job?.serviceType?.slug) return 0;

  const existing = await client.jobChecklistItem.count({ where: { jobId } });
  if (existing > 0) return 0;

  const template = templateForService(job.serviceType.slug);
  if (!template) return 0;

  const items = snapshotItems(template.items);
  await client.jobChecklistItem.createMany({
    data: items.map((item) => ({
      jobId,
      templateItemRef: item.templateItemRef,
      label: item.label,
      groupLabel: item.groupLabel,
      sortOrder: item.sortOrder,
      requiresPhoto: item.requiresPhoto,
    })),
  });
  return items.length;
}
