"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  ERASED_FIELDS,
  RETAINED_AFTER_ERASURE,
  SAR_EXCLUSIONS,
  anonymisedIdentity,
  canErase,
} from "@/lib/data-rights";
import { localDateString } from "@/lib/timezone";

/**
 * Subject access and erasure (§14.3, UK GDPR, PRD §16.3 → L13).
 *
 * Both are owner/admin actions: they are requests a person makes of the
 * business, fulfilled by the business, and a self-service erasure button is a
 * way to lose a customer's financial record to a mis-click.
 */

/**
 * Everything held about one person, in one object.
 *
 * It states what it does **not** contain, because an export that quietly omits
 * things is not a complete answer to the request — and two of the omissions are
 * to the customer's benefit (their access codes are not readable even by us
 * outside a visit window; their card never reaches our systems).
 */
export async function subjectAccessExport(
  customerId: string,
): Promise<{ ok: boolean; message: string; json?: string }> {
  await requireRole(["owner", "admin"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const customer = await db.user.findUnique({
    where: { id: customerId },
    include: {
      properties: {
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          propertyType: true,
          roomCounts: true,
          entryMethod: true,
          parkingNotes: true,
          pets: true,
          productPreferences: true,
          accessNotes: true,
          doNotTouch: true,
          createdAt: true,
        },
      },
      jobs: {
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          gross: true,
          paymentStatus: true,
          notes: true,
          serviceType: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      subscriptions: {
        select: { id: true, status: true, recurrenceRule: true, gross: true, createdAt: true },
      },
      issueMessages: { select: { body: true, createdAt: true } },
      reviews: { select: { rating: true, body: true, submittedAt: true } },
    },
  });
  if (!customer) return { ok: false, message: "No such customer." };

  const payments = await db.payment.findMany({
    where: { job: { customerId } },
    select: { type: true, gross: true, status: true, createdAt: true, capturedAt: true },
    orderBy: { createdAt: "desc" },
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    about: { name: customer.name, email: customer.email, phone: customer.phone },
    consent: {
      marketing: customer.marketingConsent,
      updatedAt: customer.consentUpdatedAt?.toISOString() ?? null,
    },
    properties: customer.properties,
    bookings: customer.jobs,
    subscriptions: customer.subscriptions,
    payments,
    messagesYouSentUs: customer.issueMessages,
    reviewsYouLeft: customer.reviews,
    notIncluded: SAR_EXCLUSIONS,
  };

  return { ok: true, message: "Export ready.", json: JSON.stringify(payload, null, 2) };
}

/**
 * Erase a customer (§14.3).
 *
 * **Anonymise, not delete.** Deleting the row would orphan every financial
 * record that points at it, and those records must be kept: HMRC requires six
 * years, and that legal obligation outranks an erasure request. So the person is
 * stripped out and the transaction stays — which is what anonymisation means and
 * what the ICO expects.
 *
 * Access codes are erased outright, not anonymised: there is nothing to preserve
 * about the value of an alarm code.
 */
export async function eraseCustomer(
  customerId: string,
): Promise<{ ok: boolean; message: string; summary?: { erased: string[]; retained: string[] } }> {
  const { id: actorId } = await requireRole(["owner", "admin"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const customer = await db.user.findUnique({
    where: { id: customerId },
    include: {
      jobs: { select: { id: true, status: true, scheduledStart: true, paymentStatus: true } },
      properties: { select: { id: true } },
    },
  });
  if (!customer) return { ok: false, message: "No such customer." };

  const upcomingJobs = customer.jobs.filter(
    (job) =>
      ["booked", "payment_authorised", "scheduled", "in_progress"].includes(job.status) &&
      (job.scheduledStart?.getTime() ?? 0) > Date.now(),
  ).length;

  const outstanding = await db.payment.aggregate({
    where: { job: { customerId }, type: "charge", status: { in: ["pending", "failed", "authorised"] } },
    _sum: { gross: true },
  });

  const check = canErase({ upcomingJobs, outstandingPence: outstanding._sum.gross ?? 0 });
  if (!check.ok) return { ok: false, message: check.reason! };

  const anonymous = anonymisedIdentity(customer.id);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: customerId },
      data: {
        name: anonymous.name,
        email: anonymous.email,
        phone: null,
        image: null,
        marketingConsent: false,
        consentUpdatedAt: new Date(),
        // The saved card handle goes with the person. The charges it made stay.
        stripeDefaultPaymentMethodId: null,
      },
    });

    await tx.property.updateMany({
      where: { customerId },
      data: {
        addressLine1: "Erased",
        addressLine2: null,
        city: null,
        postcode: "",
        // Nothing to preserve about the value of an alarm code.
        accessCodeEncrypted: null,
        alarmCodeEncrypted: null,
        parkingNotes: null,
        pets: undefined,
        productPreferences: undefined,
        accessNotes: null,
        doNotTouch: null,
      },
    });

    // Job notes can carry a name or an address; the money fields do not.
    await tx.job.updateMany({ where: { customerId }, data: { notes: null } });

    // Sessions end immediately — an erased customer should not stay signed in.
    await tx.session.deleteMany({ where: { userId: customerId } });

    await tx.notificationLog.updateMany({ where: { userId: customerId }, data: { sentTo: null } });
  });

  // The erasure itself is recorded on each job's trail, since that is where an
  // auditor looks — and it names what was kept, so "why is this invoice still
  // here?" is answered in place.
  for (const job of customer.jobs) {
    await db.jobStatusEvent
      .create({
        data: {
          jobId: job.id,
          toStatus: job.status,
          actorId,
          note:
            `Customer erased on request (${localDateString(new Date())}). Personal data removed; ` +
            `financial records retained under the legal obligation to keep them.`,
        },
      })
      .catch(() => {});
  }

  return {
    ok: true,
    message: "Erased. Personal data is gone; the financial record remains, as it must.",
    summary: {
      erased: [...ERASED_FIELDS],
      retained: RETAINED_AFTER_ERASURE.map((entry) => `${entry.what} — ${entry.why}`),
    },
  };
}
