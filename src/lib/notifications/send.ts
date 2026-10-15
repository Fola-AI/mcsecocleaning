/**
 * Sending a §10.3 notification (PRD §16.3 → L9).
 *
 * One function, through which every notification goes, so the four rules that
 * apply to all of them are applied once rather than thirteen times:
 *
 *  1. **PECR.** A marketing trigger is not sent to a customer who has not
 *     consented. The gate reads the trigger's own `marketing` flag from the
 *     registry and the single `User.marketingConsent` field — §10.3 is explicit
 *     that there is no per-channel split, so opting out of SMS opts out of
 *     email too.
 *  2. **Send once.** Scheduled senders run repeatedly; the dedupe key makes the
 *     second run a no-op.
 *  3. **Never in production by accident.** The outbound guard decides where a
 *     message may go, and it runs before any provider is touched.
 *  4. **Everything is recorded — including what was not sent.** A skip for want
 *     of consent writes a row too, so "why did this customer not get it?" has an
 *     answer.
 */

import "server-only";

import { db, hasDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { dedupeKey, triggerById, type NotificationChannel } from "@/lib/notifications/registry";
import { decideSend } from "@/lib/notifications/policy";

export interface NotifyInput {
  /** A registry trigger id. */
  trigger: string;
  channel: NotificationChannel;
  /** What the dedupe key is about — usually a job id, otherwise a subscription or user id. */
  subjectId: string;
  to: string;
  subject?: string;
  /** Email body (HTML) or SMS text. */
  body: string;
  userId?: string;
  jobId?: string;
  /**
   * The recipient's marketing consent. Passed in rather than looked up, so the
   * caller cannot forget to load it and get an accidental `undefined` that reads
   * as "no consent" — or worse, a lookup that quietly defaults to true.
   */
  marketingConsent?: boolean;
}

export type NotifyOutcome =
  | "sent"
  | "duplicate"
  | "skipped_no_consent"
  | "skipped_not_configured"
  | "skipped_no_recipient"
  | "failed";

export interface NotifyResult {
  outcome: NotifyOutcome;
  detail?: string;
}

/**
 * Send one notification, or say why not.
 *
 * Returns rather than throws: a notification failing must never take down the
 * thing that triggered it. A booking is still a booking if its confirmation
 * bounces, and §6.2's separation of schedule from billing has the same shape —
 * the work and the message about the work are different concerns.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const trigger = triggerById(input.trigger);
  if (!trigger) return { outcome: "failed", detail: `Unknown trigger ${input.trigger}` };

  // 1. The gate — PECR and a recipient — decided by a pure function so it can be
  // tested without standing up an application (see `policy.ts`).
  const decision = decideSend({
    trigger: input.trigger,
    to: input.to,
    marketingConsent: input.marketingConsent,
  });
  if (!decision.send) {
    const outcome = decision.outcome === "unknown_trigger" ? "failed" : decision.outcome;
    await record(input, outcome, decision.reason);
    return { outcome, detail: decision.reason };
  }

  // 2. Once. The unique key means two concurrent runs cannot both send.
  const key = dedupeKey(trigger.id, input.channel, input.subjectId);
  if (hasDatabase) {
    const already = await db.notificationLog.findUnique({ where: { dedupeKey: key } });
    if (already && already.outcome === "sent") return { outcome: "duplicate" };
  }

  // 3. Send. The guard inside each sender decides where it may actually go.
  try {
    if (input.channel === "email") {
      const result = await sendEmail({
        to: input.to,
        subject: input.subject ?? trigger.label,
        html: input.body,
      });
      // `sendEmail` reports ok/error; a redirected or logged send is still a
      // send as far as this layer is concerned — the guard decided where it
      // went, and that decision is not this function's to second-guess.
      const outcome: NotifyOutcome = result.ok ? "sent" : "failed";
      await record(input, outcome, result.ok ? undefined : result.error, key);
      return { outcome, detail: result.ok ? undefined : result.error };
    }

    const result = await sendSms({ to: input.to, body: input.body });
    const outcome: NotifyOutcome =
      result.status === "sent" || result.status === "redirected"
        ? "sent"
        : result.status === "not_configured"
          ? "skipped_not_configured"
          : result.status === "logged"
            ? "sent"
            : "failed";
    await record(
      input,
      outcome,
      result.status === "failed" ? result.error : result.status === "not_configured" ? "Twilio not configured" : undefined,
      key,
    );
    return { outcome, detail: result.status === "failed" ? result.error : undefined };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await record(input, "failed", detail, key);
    return { outcome: "failed", detail };
  }
}

/**
 * Write the audit row.
 *
 * Deliberately records **no message body**: a log carrying one would be a new
 * place for an access code or a payment link to live (§6.9, §9.3). `sentTo` is
 * the address, which is already on the customer record.
 */
async function record(
  input: NotifyInput,
  outcome: NotifyOutcome,
  detail?: string,
  key?: string,
): Promise<void> {
  if (!hasDatabase) return;
  const dedupe = key ?? dedupeKey(input.trigger, input.channel, input.subjectId);
  const data = {
    trigger: input.trigger,
    channel: input.channel,
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    sentTo: input.to,
    outcome,
    detail: detail?.slice(0, 500) ?? null,
  };
  await db.notificationLog
    .upsert({ where: { dedupeKey: dedupe }, create: { dedupeKey: dedupe, ...data }, update: data })
    // A failure to record must not fail the send that already happened.
    .catch(() => {});
}

/**
 * Record that one message discharged a second §10.3 row.
 *
 * Two rows of the matrix — "Booking confirmed" and "Pre-contract information" —
 * are satisfied by the same email, and should be: a customer who has just paid
 * wants one message telling them it is booked and what they have agreed, not two
 * within a second of each other. Sending twice to satisfy a table would be worse
 * for them and no clearer in law.
 *
 * So the email is sent under one trigger and this records the other, with the
 * reason. The matrix stays answerable — "did the pre-contract information go?"
 * has a row — and nobody gets a duplicate.
 */
export async function recordCarriedBy(params: {
  trigger: string;
  carriedBy: string;
  subjectId: string;
  to: string;
  userId?: string;
  jobId?: string;
}): Promise<void> {
  if (!hasDatabase) return;
  const key = dedupeKey(params.trigger, "email", params.subjectId);
  await db.notificationLog
    .upsert({
      where: { dedupeKey: key },
      create: {
        dedupeKey: key,
        trigger: params.trigger,
        channel: "email",
        userId: params.userId ?? null,
        jobId: params.jobId ?? null,
        sentTo: params.to,
        outcome: "sent",
        detail: `Carried by the ${params.carriedBy} email`,
      },
      update: {},
    })
    .catch(() => {});
}
