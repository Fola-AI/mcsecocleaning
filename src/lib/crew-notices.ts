/**
 * Telling crews about their work (§10.3: "New assignment", "Schedule change").
 *
 * Server-only, and NOT a server action — it lives here rather than in
 * `src/app/actions/` because every export of a `"use server"` module is callable
 * from a client with any argument it likes. A function that texts an arbitrary
 * crew member about an arbitrary job has no business being one of those, and the
 * action-authorisation scan said so the moment it was written there (which is
 * what that scan is for).
 */

import "server-only";

import { db } from "@/lib/db";
import { localDateString } from "@/lib/timezone";

/**
 * Tell a crew member about a job (§10.3: "New assignment", "Schedule change").
 *
 * The same message covers an assignment and an offer — both mean "there is a job
 * for you, look at the app". The crew app is where the detail lives; a text that
 * repeated it would be a second copy of a customer's address in somebody's
 * message history.
 */
export async function notifyCrewOfJob(
  jobId: string,
  crewId: string,
  kind: "assignment" | "offer" | "change",
): Promise<void> {
  const [job, crew] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
      select: {
        scheduledStart: true,
        serviceType: { select: { name: true } },
        property: { select: { postcode: true } },
      },
    }),
    db.user.findUnique({ where: { id: crewId }, select: { id: true, phone: true } }),
  ]);
  if (!job || !crew?.phone) return;

  const { templates } = await import("@/lib/notifications/templates");
  const { notify } = await import("@/lib/notifications/send");
  const { localTimeString } = await import("@/lib/timezone");

  const context = {
    serviceName: job.serviceType?.name ?? "clean",
    when: job.scheduledStart ? localDateString(job.scheduledStart) : "an unscheduled date",
    time: job.scheduledStart ? localTimeString(job.scheduledStart) : undefined,
    postcode: job.property?.postcode ?? "",
  };

  await notify({
    trigger: kind === "change" ? "crew_schedule_change" : "crew_new_assignment",
    channel: "sms",
    // Keyed on the job AND the crew member, so moving a job twice tells them
    // twice — which is the point — while one change does not text them per run.
    subjectId: `${jobId}:${crewId}:${kind === "change" ? job.scheduledStart?.toISOString() ?? "" : "new"}`,
    to: crew.phone,
    body:
      kind === "change"
        ? templates.crewScheduleChangeSms(context)
        : templates.crewAssignmentSms(context),
    userId: crew.id,
    jobId,
  });
}

/**
 * Tell everyone on a job that it has moved (§10.3 "Schedule change").
 *
 * Exported so the reschedule paths can call it; it is deliberately not folded
 * into a status change, because moving a job and changing its status are
 * different events and only one of them means "be somewhere else".
 */
export async function notifyCrewOfScheduleChange(jobId: string): Promise<void> {
  const assignments = await db.jobAssignment.findMany({ where: { jobId }, select: { crewId: true } });
  for (const assignment of assignments) {
    await notifyCrewOfJob(jobId, assignment.crewId, "change").catch(() => {});
  }
}