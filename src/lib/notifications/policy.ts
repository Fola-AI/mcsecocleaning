/**
 * Whether a notification may be sent (§10.3, §14, PECR).
 *
 * Pure, and separate from `send.ts`, for a practical reason as well as a tidy
 * one: `send.ts` is `server-only` and reaches the database, so the decision
 * inside it could only ever be tested by standing up an application. The
 * decision is the part that must be right — gate the wrong message and a
 * customer never learns their clean is booked; fail to gate the right one and it
 * is a PECR breach — so it lives where it can be tested directly.
 */

import { triggerById } from "@/lib/notifications/registry";

export type SendDecision =
  | { send: true }
  | { send: false; outcome: "skipped_no_consent" | "skipped_no_recipient" | "unknown_trigger"; reason: string };

export interface SendContext {
  trigger: string;
  to: string | null | undefined;
  /** The recipient's single marketing-consent flag (§10.3: one field, all channels). */
  marketingConsent?: boolean;
}

/**
 * The gate.
 *
 * `marketingConsent` must be **explicitly true** for a marketing message. An
 * `undefined` — a caller that forgot to load the field — reads as "no consent",
 * which is the safe direction: the cost of a withheld review request is one
 * fewer review, and the cost of the opposite is a breach.
 */
export function decideSend(context: SendContext): SendDecision {
  const trigger = triggerById(context.trigger);
  if (!trigger) {
    return { send: false, outcome: "unknown_trigger", reason: `Unknown trigger ${context.trigger}` };
  }

  if (!context.to?.trim()) {
    return { send: false, outcome: "skipped_no_recipient", reason: "No address or number on file" };
  }

  if (trigger.marketing && context.marketingConsent !== true) {
    return { send: false, outcome: "skipped_no_consent", reason: "No marketing consent" };
  }

  return { send: true };
}
