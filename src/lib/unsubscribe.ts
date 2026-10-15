/**
 * One-click unsubscribe, and SMS `STOP` (§10.3, §14, PECR).
 *
 * §10.3 is explicit that consent is **one field read by every channel**, with no
 * per-channel split: *"unsubscribe = one toggle, all channels"*. So both routes
 * in here set the same `User.marketingConsent`, and a customer who texts STOP
 * stops receiving marketing email as well. That is both what the PRD specifies
 * and what a person means when they say stop.
 *
 * The token is signed rather than guessable: an unsubscribe link that is just a
 * user id lets anyone unsubscribe anyone, which is a small nuisance for the
 * customer and a compliance problem for us (we would have no record of who
 * asked). It carries no personal data, so the URL is safe to put in an email —
 * `CLAUDE.md` forbids personal data in URLs.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Words that mean stop, per the GSMA convention Ofcom expects UK senders to honour. */
export const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"];

/**
 * Is this inbound SMS an opt-out?
 *
 * Generous on purpose: the cost of treating "STOP PLEASE" as an opt-out is
 * nothing, and the cost of not treating it as one is continuing to text someone
 * who has told us to stop — which is the breach itself, not a near miss.
 */
export function isStopMessage(body: string): boolean {
  const words = body.trim().toLowerCase().replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  return words.some((word) => STOP_WORDS.includes(word));
}

/** Sign an unsubscribe token for a user id. */
export function unsubscribeToken(userId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(userId).digest("base64url");
  return `${Buffer.from(userId).toString("base64url")}.${signature}`;
}

/**
 * Read a token back, or null if it does not verify.
 *
 * Compared in constant time, and malformed input returns null rather than
 * throwing — an unsubscribe link is clicked by mail clients, prefetchers and
 * scanners, and none of those should produce an error page.
 */
export function userIdFromToken(token: string, secret: string): string | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const userId = Buffer.from(encoded, "base64url").toString("utf8");
    if (!userId) return null;
    const expected = createHmac("sha256", secret).update(userId).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? userId : null;
  } catch {
    return null;
  }
}
