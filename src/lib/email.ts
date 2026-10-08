import { Resend } from "resend";
import {
  decideEmailRecipients,
  outboundEnv,
  redirectSubjectPrefix,
} from "@/lib/outbound-guard";

/**
 * Email sending (§10.3). Uses Resend when RESEND_API_KEY is set; otherwise logs
 * to the server so the app is fully functional before email is provisioned.
 *
 * **Every send passes through the non-production outbound guard.** Outside
 * `APP_ENV === "production"` the message goes to `DEV_EMAIL_REDIRECT`, or to the
 * log if that is unset — never to the address it was addressed to. Before the
 * guard, a dev box with a Resend key emailed real people, which L3's realistic
 * seed data and L11's client import would have made inevitable. Call this
 * function; never reach for the Resend SDK directly.
 *
 * Deliverability (§13.3): SPF, DKIM and DMARC MUST be configured and warmed
 * before launch — booking confirmations landing in spam is business-ending.
 */
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || "mcsecocleaning <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true; id?: string; redirected?: boolean; logged?: boolean }
  | { ok: false; error: string };

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const decision = decideEmailRecipients(outboundEnv(), to);

  if (decision.action === "log") {
    console.log(
      `[email:blocked] ${decision.reason} | intended: ${decision.intendedFor.join(", ") || "(none)"} | subject: ${subject}`
    );
    return { ok: true, logged: true };
  }

  // Label a redirected message so it is never mistaken for a genuine one.
  const finalSubject =
    decision.action === "redirect"
      ? `${redirectSubjectPrefix(decision.intendedFor)} ${subject}`
      : subject;

  if (!resend) {
    console.log(`[email:dev] To: ${decision.to.join(", ")} | Subject: ${finalSubject}`);
    return { ok: true, logged: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: decision.to,
      subject: finalSubject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id, redirected: decision.action === "redirect" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown email error" };
  }
}
