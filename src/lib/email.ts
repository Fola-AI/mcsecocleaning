import { Resend } from "resend";

/**
 * Email sending (§6.17). Uses Resend when RESEND_API_KEY is set; otherwise logs
 * to the server so the app is fully functional before email is provisioned.
 *
 * Deliverability (§9.2): SPF, DKIM and DMARC MUST be configured and warmed
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

export async function sendEmail({ to, subject, html, replyTo }: SendEmailInput): Promise<
  { ok: true; id?: string } | { ok: false; error: string }
> {
  if (!resend) {
    console.log(`[email:dev] To: ${Array.isArray(to) ? to.join(", ") : to} | Subject: ${subject}`);
    return { ok: true };
  }
  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown email error" };
  }
}
