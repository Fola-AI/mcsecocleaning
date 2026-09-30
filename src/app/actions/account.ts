"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import { prepareOutstandingCheckoutForVerifiedJob } from "@/app/actions/payments";
import { encryptedCodeFieldValue } from "@/lib/account-codes";

/**
 * Customer account actions (§7.1, §14.3). EVERY one applies the ownership filter
 * `customerId: id` from the session BEFORE acting — a job/subscription id from the
 * request is not authorisation (§3). No action fetches by id alone.
 */

/** Pay an outstanding balance on the customer's OWN job. Returns the Checkout URL
 *  to redirect to. Ownership is verified before the shared checkout core runs. */
export async function payMyOutstanding(jobId: string): Promise<{ ok: boolean; message: string; url?: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  // Ownership filter FIRST — scope the job to this customer. Not theirs → not found.
  const owned = await db.job.findFirst({ where: { id: jobId, customerId: id }, select: { id: true, status: true } });
  if (!owned) return { ok: false, message: "Booking not found." };
  // A cancelled booking is never payable (the shared checkout core refuses it too).
  if (owned.status === "cancelled") return { ok: false, message: "This booking was cancelled — there's nothing to pay." };

  const res = await prepareOutstandingCheckoutForVerifiedJob(jobId);
  if (!res.ok || !res.url) return { ok: false, message: res.message };
  return { ok: true, message: res.message, url: res.url };
}

/** Pause the customer's OWN active subscription — no new visits until resumed. The
 *  scheduler only materialises `active` subscriptions, so this is all that's needed. */
export async function pauseMySubscription(subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const { count } = await db.subscription.updateMany({
    where: { id: subscriptionId, customerId: id, status: "active" },
    data: { status: "paused" },
  });
  if (count === 0) return { ok: false, message: "Plan not found." };
  return { ok: true, message: "Plan paused — no visits until you resume." };
}

/** Resume the customer's OWN paused subscription. */
export async function resumeMySubscription(subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const { count } = await db.subscription.updateMany({
    where: { id: subscriptionId, customerId: id, status: "paused" },
    data: { status: "active" },
  });
  if (count === 0) return { ok: false, message: "Plan not found." };
  return { ok: true, message: "Plan resumed — visits will be scheduled again." };
}

/** Cancel the customer's OWN subscription — ends the plan. */
export async function cancelMySubscription(subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const { count } = await db.subscription.updateMany({
    where: { id: subscriptionId, customerId: id, status: { in: ["active", "paused"] } },
    data: { status: "cancelled" },
  });
  if (count === 0) return { ok: false, message: "Plan not found." };
  return { ok: true, message: "Plan cancelled." };
}

/** Update the customer's OWN marketing preference (PECR). One consent field governs
 *  ALL channels — any future email or SMS marketing gates on User.marketingConsent,
 *  so opting out here suppresses every channel, not one. */
export async function updateMyMarketingPrefs(consent: boolean): Promise<{ ok: boolean; message: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  await db.user.update({
    where: { id },
    data: { marketingConsent: consent, consentUpdatedAt: new Date() },
  });
  return { ok: true, message: consent ? "You're subscribed to updates." : "You've unsubscribed from all marketing." };
}

export interface PropertyEditInput {
  addressLine1?: string;
  entryMethod?: string;
  parkingNotes?: string;
  accessNotes?: string;
  doNotTouch?: string;
  newLockboxCode?: string;
  newAlarmCode?: string;
}

/**
 * Update the customer's OWN property. Non-sensitive fields are set directly. Access
 * codes are WRITE-ONLY: a new value is re-encrypted (§9.3); a blank value leaves the
 * stored code UNCHANGED (never overwritten with empty). The stored code is never
 * decrypted back to the page, so this action only ever writes ciphertext.
 */
export async function updateMyProperty(propertyId: string, input: PropertyEditInput): Promise<{ ok: boolean; message: string }> {
  const { id } = await requireCustomer();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const owned = await db.property.findFirst({ where: { id: propertyId, customerId: id }, select: { id: true } });
  if (!owned) return { ok: false, message: "Property not found." };

  const data: Record<string, unknown> = {
    addressLine1: input.addressLine1?.trim() || undefined,
    entryMethod: input.entryMethod || undefined,
    parkingNotes: input.parkingNotes ?? undefined,
    accessNotes: input.accessNotes ?? undefined,
    doNotTouch: input.doNotTouch ?? undefined,
  };
  // Codes: include ONLY when a new value was given (blank → unchanged).
  const lockbox = encryptedCodeFieldValue(input.newLockboxCode);
  if (lockbox !== undefined) data.accessCodeEncrypted = lockbox;
  const alarm = encryptedCodeFieldValue(input.newAlarmCode);
  if (alarm !== undefined) data.alarmCodeEncrypted = alarm;

  await db.property.update({ where: { id: propertyId }, data });
  return { ok: true, message: "Property updated." };
}
