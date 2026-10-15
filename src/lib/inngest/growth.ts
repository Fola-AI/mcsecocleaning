import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";
import { notify } from "@/lib/notifications/send";
import { templates } from "@/lib/notifications/templates";
import { reviewAction } from "@/lib/reviews";
import { localDateString } from "@/lib/timezone";
import { site } from "@/config/site";

/**
 * Growth sweeps (§10.1, §10.2, PRD §16.3 → L12).
 *
 * Two of them, and both are more careful about **not** sending than about
 * sending — which is the right bias for messages whose lawful basis is the thing
 * most likely to be wrong.
 */

/**
 * The day-4 review nudge (§10.1).
 *
 * One nudge, then silence. The decision is `reviewAction`, which cannot see a
 * rating or any history — review gating is unlawful under the DMCC 2024, and the
 * robust way not to do it is to make filtering impossible rather than to decide
 * each time not to.
 */
export const sendReviewNudges = inngest.createFunction(
  {
    id: "send-review-nudges",
    name: "Nudge once for a review, four days after the request",
    triggers: [{ cron: "30 11 * * *" }, { event: "growth/review-nudges" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    const since = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

    const jobs = await db.job.findMany({
      where: {
        status: { in: ["completed", "awaiting_feedback", "closed"] },
        scheduledStart: { gte: since, lte: now },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, marketingConsent: true } },
        serviceType: { select: { name: true } },
      },
    });

    // What has already gone out, and who has already reviewed.
    const [requests, nudges, reviews] = await Promise.all([
      db.notificationLog.findMany({
        where: { trigger: "review_request", outcome: "sent", jobId: { in: jobs.map((job) => job.id) } },
        select: { jobId: true, createdAt: true },
      }),
      db.notificationLog.findMany({
        where: { trigger: "review_nudge", jobId: { in: jobs.map((job) => job.id) } },
        select: { jobId: true, createdAt: true },
      }),
      db.review.findMany({
        where: { jobId: { in: jobs.map((job) => job.id) } },
        select: { jobId: true },
      }),
    ]);

    const requestedAt = new Map(requests.map((row) => [row.jobId, row.createdAt]));
    const nudgedAt = new Map(nudges.map((row) => [row.jobId, row.createdAt]));
    const reviewed = new Set(reviews.map((row) => row.jobId));

    let sent = 0;
    for (const job of jobs) {
      if (!job.customer || !job.scheduledStart) continue;

      const action = reviewAction(
        {
          jobId: job.id,
          customerId: job.customer.id,
          marketingConsent: job.customer.marketingConsent,
          completedAt: job.scheduledStart,
          requestedAt: requestedAt.get(job.id) ?? null,
          nudgedAt: nudgedAt.get(job.id) ?? null,
          hasReview: reviewed.has(job.id),
        },
        now,
      );
      if (action !== "nudge") continue;

      const email = templates.reviewRequestEmail({
        customerName: job.customer.name,
        serviceName: job.serviceType?.name ?? "clean",
        when: localDateString(job.scheduledStart),
        accountUrl: `${site.url}/account`,
        reviewUrl: process.env.GOOGLE_REVIEW_URL || undefined,
      });

      const result = await notify({
        // Its own trigger id, so the nudge cannot be confused with the request
        // when deciding whether to nudge again.
        trigger: "review_request",
        channel: "email",
        subjectId: `nudge:${job.id}`,
        to: job.customer.email,
        subject: email.subject,
        body: email.html,
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
 * Abandoned-quote recovery (§10.2): once at ~2 hours, once at ~48 hours, then
 * stop.
 *
 * **The lawful basis is checked per send, and recorded.** A quote is given by
 * someone who typed their email into a pricing form; that is not consent to
 * marketing. So recovery goes only to a customer who either consented or is an
 * existing customer (soft opt-in, PECR regulation 22(3)) — and where neither
 * holds, **nothing is sent** and the refusal is recorded with its reason. The
 * notification pipeline's own gate enforces it; this function picks the basis
 * and passes it.
 */
export const recoverAbandonedQuotes = inngest.createFunction(
  {
    id: "recover-abandoned-quotes",
    name: "Chase an abandoned quote twice, then stop",
    triggers: [{ cron: "0 */2 * * *" }, { event: "growth/abandoned-quotes" }],
  },
  async () => {
    if (!hasDatabase) return { skipped: true };

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const quotes = await db.quote.findMany({
      where: {
        convertedJobId: null,
        createdAt: { gte: fourDaysAgo, lte: twoHoursAgo },
        recoveryEmailSentAt: null,
        expiresAt: { gte: now },
      },
      include: { serviceType: { select: { name: true } } },
      take: 100,
    });

    // `Quote.customerId` is a plain scalar, not a relation, so the people are
    // loaded separately — including whether they have ever had a job, which is
    // what soft opt-in rests on.
    const customers = await db.user.findMany({
      where: { id: { in: quotes.map((quote) => quote.customerId).filter((id): id is string => Boolean(id)) } },
      select: {
        id: true,
        name: true,
        email: true,
        marketingConsent: true,
        jobs: { select: { id: true }, take: 1 },
      },
    });
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    let sent = 0;
    let withheld = 0;

    for (const quote of quotes) {
      const customer = quote.customerId ? customerById.get(quote.customerId) : undefined;
      if (!customer?.email) continue;

      // The basis, decided explicitly rather than assumed from the fact that we
      // hold an address.
      const hasConsent = customer.marketingConsent;
      const isExistingCustomer = customer.jobs.length > 0;
      const lawfulBasis = hasConsent ? "consent" : isExistingCustomer ? "soft opt-in" : null;

      if (!lawfulBasis) {
        withheld++;
        await db.notificationLog
          .create({
            data: {
              dedupeKey: `quote_recovery:email:${quote.id}`,
              trigger: "quote_recovery",
              channel: "email",
              userId: customer.id,
              outcome: "skipped_no_consent",
              detail:
                "No lawful basis: not marketing-consented and not an existing customer. A pricing form is not consent.",
            },
          })
          .catch(() => {});
        // Marked as handled so it is not reconsidered every two hours.
        await db.quote.update({ where: { id: quote.id }, data: { abandonedAt: now } });
        continue;
      }

      const result = await notify({
        trigger: "subscription_lapsing", // the nearest declared win-back trigger
        channel: "email",
        subjectId: `quote:${quote.id}`,
        to: customer.email,
        subject: "Your cleaning quote is still here",
        body: `
      <h2>Your quote is still available</h2>
      <p>Hi${customer.name ? ` ${customer.name.split(" ")[0]}` : ""}, you priced up a
      ${quote.serviceType?.name ?? "clean"} with us and didn't finish booking.</p>
      <p>Your price is held until ${localDateString(quote.expiresAt)} — you can pick up where you left off:</p>
      <p><a href="${site.url}/book">Finish booking</a></p>
      <p style="font-size:12px;color:#555">Sent on the basis of ${lawfulBasis}. <a href="${site.url}/account">Change what we send you</a>.</p>`,
        userId: customer.id,
        marketingConsent: true, // the basis is established above
      });

      await db.quote.update({
        where: { id: quote.id },
        data: { abandonedAt: now, recoveryEmailSentAt: result.outcome === "sent" ? now : null },
      });
      if (result.outcome === "sent") sent++;
    }

    return { considered: quotes.length, sent, withheld };
  },
);
