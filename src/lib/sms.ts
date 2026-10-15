/**
 * SMS (§10.3, PRD §16.3 → L9).
 *
 * Every send goes through the L1 outbound guard, exactly as email does: outside
 * production a message is redirected to `DEV_SMS_REDIRECT`, or logged if there
 * is none. Nothing here talks to a provider SDK directly.
 *
 * ## Parked, not stubbed
 *
 * `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are not configured, so no message
 * can actually be delivered. This module says so and records what it *would*
 * have sent, rather than throwing: the triggers, the consent gate, the dedupe
 * and the copy are all testable without the keys, and the day they are filled
 * the only change is that `deliver` stops returning `not_configured`.
 *
 * It is deliberately not a mock that pretends to succeed. A send that silently
 * "worked" without a provider is how a business discovers at launch that no
 * customer has ever received a text.
 */

import "server-only";

import { decideSmsRecipients, outboundEnv, redirectSubjectPrefix } from "@/lib/outbound-guard";

export interface SendSmsInput {
  to: string;
  /** The message. Kept short — §10.3 budgets about 4p a message. */
  body: string;
}

export type SendSmsResult =
  | { status: "sent"; to: string[] }
  | { status: "redirected"; to: string[]; intendedFor: string[] }
  | { status: "logged"; intendedFor: string[]; reason: string }
  | { status: "not_configured"; intendedFor: string[] }
  | { status: "failed"; error: string };

export function smsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SENDER_ID);
}

/**
 * Send one message.
 *
 * The guard runs **first**, before the provider check, so a non-production send
 * is redirected or logged whatever the key state — the rule that a dev run never
 * texts a customer does not depend on Twilio being configured.
 */
export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const decision = decideSmsRecipients(outboundEnv(), to);

  if (decision.action === "log") {
    console.log(`[sms] ${decision.reason} — would have sent to ${decision.intendedFor.join(", ")}`);
    return { status: "logged", intendedFor: decision.intendedFor, reason: decision.reason };
  }

  if (!smsConfigured()) {
    // Named clearly so a caller can record "not configured" rather than
    // "failed": nothing is wrong, the keys simply are not there (SETUP §3.8).
    const intendedFor = decision.action === "redirect" ? decision.intendedFor : decision.to;
    console.log(`[sms] Twilio is not configured — would have sent to ${intendedFor.join(", ")}`);
    return { status: "not_configured", intendedFor };
  }

  const recipients = decision.to;
  const prefix = decision.action === "redirect" ? redirectSubjectPrefix(decision.intendedFor) : "";

  try {
    // Twilio's REST API directly rather than the SDK: one authenticated POST,
    // no dependency, and nothing here that the guard above has not already
    // decided.
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_SENDER_ID!;

    for (const recipient of recipients) {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: recipient, From: from, Body: `${prefix}${body}` }),
      });
      if (!response.ok) {
        const detail = await response.text();
        // The provider's message, not the body we tried to send: an error log
        // that echoed the message would be a new place for a payment link to
        // live.
        return { status: "failed", error: `Twilio ${response.status}: ${detail.slice(0, 200)}` };
      }
    }

    return decision.action === "redirect"
      ? { status: "redirected", to: recipients, intendedFor: decision.intendedFor }
      : { status: "sent", to: recipients };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
