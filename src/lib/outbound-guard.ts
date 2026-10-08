/**
 * Non-production outbound guard (`CLAUDE.md` → *Git and environments*).
 *
 * Until this existed, `src/lib/email.ts` sent to whatever address it was given
 * as soon as `RESEND_API_KEY` was present. On a dev machine seeded with
 * realistic data (L3 seeds 20 customers) or carrying a real imported client
 * list, that is a live email to a real person — and the same applies to SMS
 * once Twilio lands in L9.
 *
 * The rule: unless `APP_ENV === "production"`, nothing reaches a real
 * recipient. It goes to the dev redirect address, or, if none is configured, to
 * the log and nowhere else. Failing closed is deliberate — a message that
 * didn't arrive is a bug, a message that reached a customer from a dev box is
 * an incident.
 *
 * `APP_ENV` unset counts as non-production. Production has to say so.
 *
 * These functions are pure so the decision is tested without a mail provider;
 * `outbound-guard.test.ts` covers it. Never bypass them — call `sendEmail` (or,
 * from L9, the SMS sender), never the provider SDK directly.
 */

export interface OutboundEnv {
  /** `APP_ENV` — only the exact string "production" permits a real send. */
  appEnv?: string;
  /** `DEV_EMAIL_REDIRECT` — every non-production email lands here. */
  devEmailRedirect?: string;
  /** `DEV_SMS_REDIRECT` — every non-production SMS lands here. */
  devSmsRedirect?: string;
}

export type OutboundDecision<T> =
  /** Production: deliver to the real recipients. */
  | { action: "send"; to: T[] }
  /** Non-production with a redirect configured: deliver there instead. */
  | { action: "redirect"; to: T[]; intendedFor: T[] }
  /** Non-production with no redirect: log it, send nothing. */
  | { action: "log"; intendedFor: T[]; reason: string };

export function isProduction(env: OutboundEnv): boolean {
  return (env.appEnv ?? "").trim().toLowerCase() === "production";
}

function normaliseList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((t) => t.trim()).filter((t) => t !== "");
}

/**
 * Where an email may actually go.
 *
 * Note the redirect collapses every recipient to one address: a dev run must
 * not fan out to several inboxes, and the intended recipients are preserved in
 * `intendedFor` so the caller can label the message.
 */
export function decideEmailRecipients(
  env: OutboundEnv,
  to: string | string[]
): OutboundDecision<string> {
  const intendedFor = normaliseList(to);

  if (intendedFor.length === 0) {
    return { action: "log", intendedFor, reason: "no recipient address given" };
  }

  if (isProduction(env)) return { action: "send", to: intendedFor };

  const redirect = (env.devEmailRedirect ?? "").trim();
  if (redirect === "") {
    return {
      action: "log",
      intendedFor,
      reason:
        'APP_ENV is not "production" and DEV_EMAIL_REDIRECT is not set — ' +
        "logging instead of sending, so no real recipient is contacted.",
    };
  }

  return { action: "redirect", to: [redirect], intendedFor };
}

/** The same decision for SMS. Used from L9; the rule is identical. */
export function decideSmsRecipients(
  env: OutboundEnv,
  to: string | string[]
): OutboundDecision<string> {
  const intendedFor = normaliseList(to);

  if (intendedFor.length === 0) {
    return { action: "log", intendedFor, reason: "no recipient number given" };
  }

  if (isProduction(env)) return { action: "send", to: intendedFor };

  const redirect = (env.devSmsRedirect ?? "").trim();
  if (redirect === "") {
    return {
      action: "log",
      intendedFor,
      reason:
        'APP_ENV is not "production" and DEV_SMS_REDIRECT is not set — ' +
        "logging instead of sending. Twilio trial accounts only reach verified " +
        "numbers, but this guard does not rely on that.",
    };
  }

  return { action: "redirect", to: [redirect], intendedFor };
}

/**
 * A subject prefix naming the real intended recipient, so a redirected message
 * is never mistaken for a genuine one sitting in the dev inbox.
 */
export function redirectSubjectPrefix(intendedFor: string[]): string {
  const shown = intendedFor.slice(0, 2).join(", ");
  const more = intendedFor.length > 2 ? ` +${intendedFor.length - 2}` : "";
  return `[dev → ${shown}${more}]`;
}

/** Reads the live environment. */
export function outboundEnv(): OutboundEnv {
  return {
    appEnv: process.env.APP_ENV,
    devEmailRedirect: process.env.DEV_EMAIL_REDIRECT,
    devSmsRedirect: process.env.DEV_SMS_REDIRECT,
  };
}
