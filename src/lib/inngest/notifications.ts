import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";
import { notify } from "@/lib/notifications/send";
import { templates } from "@/lib/notifications/templates";
import { localDateString, localTimeString } from "@/lib/timezone";
import { site } from "@/config/site";

/**
 * The scheduled §10.3 notifications (PRD §16.3 → L9).
 *
 * Three sweeps rather than three timers per job: a job does not need a timer, it
 * needs someone to notice it is tomorrow. Each sweep is idempotent through the
 * notification log, so running hourly — or twice, or after a restart — sends one
 * message.
 *
 * Every sweep returns counts rather than throwing. A notification failing must
 * never take down the schedule that triggered it.
 */

const HOUR = 60 * 60 * 1000;

function accountUrl(): string {
  return `${site.url}/account`;
}

/** 24-hour reminder (§10.3). Runs hourly; the log makes it send once. */
export const sendVisitReminders = inngest.createFunction(
  {
    id: "send-visit-reminders",
    name: "Remind customers 24h before a visit",
    triggers: [{ cron: "0 * * * *" }, { event: "notifications/reminders" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    // A window, not an instant: the sweep runs hourly, so "24 hours away" has to
    // mean "between 23 and 25 hours away" or a job slips between two runs.
    const jobs = await db.job.findMany({
      where: {
        status: { in: ["booked", "payment_authorised", "scheduled"] },
        scheduledStart: { gte: new Date(now.getTime() + 23 * HOUR), lte: new Date(now.getTime() + 25 * HOUR) },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, marketingConsent: true } },
        serviceType: { select: { name: true } },
      },
    });

    let sent = 0;
    for (const job of jobs) {
      if (!job.customer || !job.scheduledStart) continue;
      const context = {
        customerName: job.customer.name,
        serviceName: job.serviceType?.name ?? "clean",
        when: localDateString(job.scheduledStart),
        time: localTimeString(job.scheduledStart),
        accountUrl: accountUrl(),
      };

      const email = templates.reminder24hEmail(context);
      const emailResult = await notify({
        trigger: "reminder_24h",
        channel: "email",
        subjectId: job.id,
        to: job.customer.email,
        subject: email.subject,
        body: email.html,
        userId: job.customer.id,
        jobId: job.id,
        marketingConsent: job.customer.marketingConsent,
      });
      if (emailResult.outcome === "sent") sent++;

      if (job.customer.phone) {
        await notify({
          trigger: "reminder_24h",
          channel: "sms",
          subjectId: job.id,
          to: job.customer.phone,
          body: templates.reminder24hSms(context),
          userId: job.customer.id,
          jobId: job.id,
          marketingConsent: job.customer.marketingConsent,
        });
      }
    }

    return { considered: jobs.length, sent };
  },
);

/**
 * The 3-day message before a recurring visit, carrying the skip link (§10.3,
 * §7.3).
 *
 * This one earns its cost: a customer who cannot easily skip a visit they do not
 * need cancels the plan instead.
 */
export const sendRecurringVisitNotices = inngest.createFunction(
  {
    id: "send-recurring-visit-notices",
    name: "Tell customers about a recurring visit 3 days ahead, with a skip link",
    triggers: [{ cron: "0 9 * * *" }, { event: "notifications/recurring-notice" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    const jobs = await db.job.findMany({
      where: {
        subscriptionId: { not: null },
        status: { in: ["booked", "payment_authorised", "scheduled"] },
        scheduledStart: { gte: new Date(now.getTime() + 60 * HOUR), lte: new Date(now.getTime() + 84 * HOUR) },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, marketingConsent: true } },
        serviceType: { select: { name: true } },
      },
    });

    let sent = 0;
    for (const job of jobs) {
      if (!job.customer?.phone || !job.scheduledStart) continue;
      const result = await notify({
        trigger: "recurring_visit_3d",
        channel: "sms",
        subjectId: job.id,
        to: job.customer.phone,
        body: templates.recurringVisit3dSms({
          customerName: job.customer.name,
          serviceName: job.serviceType?.name ?? "clean",
          when: localDateString(job.scheduledStart),
          time: localTimeString(job.scheduledStart),
          accountUrl: accountUrl(),
          skipUrl: `${site.url}/account`,
        }),
        userId: job.customer.id,
        jobId: job.id,
        marketingConsent: job.customer.marketingConsent,
      });
      if (result.outcome === "sent") sent++;
    }

    return { considered: jobs.length, sent };
  },
);

/**
 * Review request, 24 hours after a completed visit (§10.3, §10.1).
 *
 * **Marketing**, so it is gated on consent — and under the DMCC 2024 the request
 * goes to everyone who consented, not only to customers we expect to be happy
 * (§10.1 forbids review gating).
 */
export const sendReviewRequests = inngest.createFunction(
  {
    id: "send-review-requests",
    name: "Ask for a review 24h after a visit",
    triggers: [{ cron: "0 11 * * *" }, { event: "notifications/review-requests" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    const jobs = await db.job.findMany({
      where: {
        status: { in: ["completed", "awaiting_feedback", "closed"] },
        scheduledStart: { gte: new Date(now.getTime() - 48 * HOUR), lte: new Date(now.getTime() - 24 * HOUR) },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, marketingConsent: true } },
        serviceType: { select: { name: true } },
      },
    });

    let sent = 0;
    let withheld = 0;
    for (const job of jobs) {
      if (!job.customer || !job.scheduledStart) continue;
      const context = {
        customerName: job.customer.name,
        serviceName: job.serviceType?.name ?? "clean",
        when: localDateString(job.scheduledStart),
        accountUrl: accountUrl(),
        // Empty until Fola supplies the Google Business Profile link (L12).
        reviewUrl: process.env.GOOGLE_REVIEW_URL || undefined,
      };
      const email = templates.reviewRequestEmail(context);
      const result = await notify({
        trigger: "review_request",
        channel: "email",
        subjectId: job.id,
        to: job.customer.email,
        subject: email.subject,
        body: email.html,
        userId: job.customer.id,
        jobId: job.id,
        marketingConsent: job.customer.marketingConsent,
      });
      if (result.outcome === "sent") sent++;
      if (result.outcome === "skipped_no_consent") withheld++;
    }

    return { considered: jobs.length, sent, withheld };
  },
);

/**
 * Tell a customer their plan is paused and nothing is being booked (§10.3
 * "Subscription lapsing").
 *
 * **Marketing**, and marked as such in the registry: it exists to keep revenue.
 * So it is gated on consent, and a customer who has opted out simply does not
 * get it — their plan stays paused and they can restart it whenever they like
 * from their account.
 *
 * Sent once per pause, not once a week. A paused plan is a decision, not a
 * problem to nag about; the dedupe key is the subscription plus the week it was
 * paused, so a customer who pauses, restarts and pauses again hears from us
 * about the second pause and not four times about the first.
 */
export const sendLapsingNotices = inngest.createFunction(
  {
    id: "send-lapsing-notices",
    name: "Tell customers a paused plan is not being booked",
    triggers: [{ cron: "0 10 * * 1" }, { event: "notifications/lapsing" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    const paused = await db.subscription.findMany({
      where: {
        status: "paused",
        // Give it a week before saying anything: somebody who paused yesterday
        // knows they paused it.
        updatedAt: { lte: new Date(now.getTime() - 7 * 24 * HOUR) },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, marketingConsent: true } },
        serviceType: { select: { name: true } },
      },
    });

    let sent = 0;
    let withheld = 0;
    for (const subscription of paused) {
      if (!subscription.customer) continue;
      const email = templates.subscriptionLapsingEmail({
        customerName: subscription.customer.name,
        serviceName: subscription.serviceType?.name ?? "cleaning",
        when: localDateString(subscription.updatedAt),
        accountUrl: accountUrl(),
      });
      const result = await notify({
        trigger: "subscription_lapsing",
        channel: "email",
        // The pause, not the subscription: pausing again later is a new event.
        subjectId: `${subscription.id}:${localDateString(subscription.updatedAt)}`,
        to: subscription.customer.email,
        subject: email.subject,
        body: email.html,
        userId: subscription.customer.id,
        marketingConsent: subscription.customer.marketingConsent,
      });
      if (result.outcome === "sent") sent++;
      if (result.outcome === "skipped_no_consent") withheld++;
    }

    return { considered: paused.length, sent, withheld };
  },
);
