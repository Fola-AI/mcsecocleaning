import { db, hasDatabase } from "@/lib/db";
import { isStopMessage } from "@/lib/unsubscribe";
import { normaliseIdentifier } from "@/lib/crew-pin";
import { signedRequestUrl, verifyTwilioSignature } from "@/lib/twilio-signature";

export const runtime = "nodejs";

/**
 * Inbound SMS — `STOP` (§10.3, §14, PECR).
 *
 * Twilio posts here when someone replies to a message. The only reply this
 * needs to understand is an opt-out, and it sets the **same single consent
 * field** the email unsubscribe does: §10.3 states there is no per-channel
 * split, and a customer who texts STOP means stop, not "stop texting but keep
 * emailing".
 *
 * It always answers 200. A provider that gets an error retries, and a retry
 * storm on an opt-out would be the worst possible thing to get wrong — the
 * opt-out is recorded or it is not, and either way arguing with Twilio about it
 * helps nobody.
 *
 * Note: Twilio also honours STOP at its own level and will stop delivering to
 * that number regardless. This route is what makes our *records* agree with
 * that, so a later export, campaign or channel does not treat them as
 * subscribed.
 *
 * ## The signature (L14)
 *
 * It is verified whenever `TWILIO_AUTH_TOKEN` is set, and an unsigned or wrong
 * signature gets 403. Without a token there is nothing to verify against: in
 * production that is a refusal — no token means no configured Twilio, so no
 * legitimate request — and outside production it is allowed, which is what lets
 * the behaviour be exercised by a POST from a test.
 */
export async function POST(request: Request): Promise<Response> {
  let from = "";
  let body = "";
  const params: Record<string, string> = {};

  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params[key] = value;
    }
    from = params.From ?? "";
    body = params.Body ?? "";
  } catch {
    return new Response("ok", { status: 200 });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const genuine = verifyTwilioSignature({
      signature: request.headers.get("x-twilio-signature"),
      authToken,
      url: signedRequestUrl(request),
      params,
    });
    // 403, not 200: a forged request is not a delivery to acknowledge, and the
    // 200-always rule above exists so TWILIO stops retrying — it is not a reason
    // to accept requests from anyone else.
    if (!genuine) return new Response("forbidden", { status: 403 });
  } else if (process.env.APP_ENV === "production") {
    return new Response("forbidden", { status: 403 });
  }

  if (!isStopMessage(body)) return new Response("ok", { status: 200 });
  if (!hasDatabase || !from) return new Response("ok", { status: 200 });

  // Match on the normalised number, since a customer's stored number may carry
  // spaces or a local prefix while Twilio sends E.164.
  const normalised = normaliseIdentifier(from);
  const tail = normalised.replace(/^\+?44/, "").replace(/^0/, "");
  const candidates = await db.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  const match = candidates.find((user) => {
    const theirs = normaliseIdentifier(user.phone ?? "").replace(/^\+?44/, "").replace(/^0/, "");
    return theirs.length > 6 && theirs === tail;
  });

  if (match) {
    await db.user.update({
      where: { id: match.id },
      data: { marketingConsent: false, consentUpdatedAt: new Date() },
    });
    await db.notificationLog
      .create({
        data: {
          dedupeKey: `sms_stop:${match.id}:${Date.now()}`,
          trigger: "sms_stop",
          channel: "sms",
          userId: match.id,
          outcome: "sent",
          detail: "Customer texted STOP — marketing consent withdrawn on all channels",
        },
      })
      .catch(() => {});
  }

  return new Response("ok", { status: 200 });
}
