/**
 * Twilio request signatures (§13.3, `CLAUDE.md` → *Security rules*: "Webhooks
 * verify signatures and are idempotent on event id").
 *
 * Found in the L14 review: `/api/sms/inbound` accepted any POST. The damage was
 * limited — the only thing it does is set `marketingConsent` to **false**, so a
 * forged request could opt someone OUT but never in — yet "anyone can change a
 * customer record by guessing a phone number" is not a thing to launch with,
 * and the rule says every webhook verifies.
 *
 * Twilio does not use a JWT or a shared secret header; it signs the request:
 *
 *   signature = base64( HMAC-SHA1( authToken, url + concat(sorted POST params) ) )
 *
 * where `url` is the full URL Twilio was configured to call (including any query
 * string) and each parameter contributes `name + value` with no separators, in
 * byte order of the name. The result arrives in `X-Twilio-Signature`.
 *
 * Deliberately not `server-only` and taking the token as an argument rather than
 * reading the environment: this is the kind of code that must be testable
 * against a published vector, and a module that reaches for `process.env` makes
 * that awkward. The route reads the token; this only does the maths.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The signed string: the URL, then every parameter sorted by name. */
export function twilioSignatureBase(url: string, params: Record<string, string>): string {
  let base = url;
  for (const key of Object.keys(params).sort()) base += key + params[key];
  return base;
}

export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  return createHmac("sha1", authToken).update(twilioSignatureBase(url, params), "utf8").digest("base64");
}

/**
 * Whether a request's signature is genuine.
 *
 * Compared with `timingSafeEqual`, and the lengths are checked first: the
 * function throws on a length mismatch, and an empty-versus-empty comparison
 * returns true — which is how a blank crew PIN hash nearly authenticated every
 * sign-in in L5. The same shape of bug, so the same shape of guard.
 */
export function verifyTwilioSignature({
  signature,
  authToken,
  url,
  params,
}: {
  signature: string | null | undefined;
  authToken: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!signature || !authToken) return false;
  const expected = twilioSignature(authToken, url, params);
  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length || want.length === 0) return false;
  return timingSafeEqual(given, want);
}

/**
 * The URL Twilio signed.
 *
 * Twilio signs the URL **as configured in the console**, which behind a proxy is
 * not necessarily what the handler sees: Vercel's internal request URL can carry
 * a different host or protocol. `TWILIO_WEBHOOK_URL` is therefore honoured first
 * and is the thing to set if verification ever fails in production; otherwise
 * the forwarded headers are used, which is correct for Vercel and for local dev.
 */
export function signedRequestUrl(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.TWILIO_WEBHOOK_URL;
  if (configured) return configured;

  const url = new URL(request.url);
  // Rebuilt by hand rather than by assigning to `url.host`: the URL host setter
  // keeps the existing port when the new value has none, which turned
  // `www.example.com` into `www.example.com:3000` — the wrong string to sign.
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}
