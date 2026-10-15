/**
 * Rate limiting (§13.3, PRD §16.3 → L14).
 *
 * §13.3 requires it on quote, booking and auth endpoints; L5 added a per-account
 * lockout for the crew PIN, which is a different thing — that one protects one
 * credential, this one protects the service from a client hammering it.
 *
 * ## Why Postgres, and why behind an interface
 *
 * SETUP **D5** (Upstash Redis or Postgres) is unanswered. Postgres is built
 * because it needs no account and works today, and the call sites talk to
 * `checkRateLimit` rather than to a store — so answering D5 "Upstash" later is
 * an adapter and some keys, not a change to every endpoint.
 *
 * The window is a **fixed window**, not a sliding one. A sliding window is more
 * accurate and needs either a sorted set or a row per request; at this scale the
 * difference is a handful of extra requests at a boundary, and the simpler thing
 * that cannot drift is worth more than the accuracy.
 *
 * Deliberately **not** marked `server-only`, for the same reason
 * `src/lib/materialise.ts` is not: the gates have to be able to drive it
 * directly, and a limiter that can only be exercised by firing sixty real
 * requests at a dev server is one whose counting nobody has actually checked.
 * It reads no secret, and it is imported only from server actions.
 */

import { db } from "@/lib/db";

export interface RateLimitRule {
  /** What is being limited, e.g. "quote". Part of the key. */
  name: string;
  /** How many requests are allowed in a window. */
  limit: number;
  /** The window, in seconds. */
  windowSeconds: number;
}

/**
 * The limits (§13.3).
 *
 * Deliberately generous. A limit that catches real customers is worse than no
 * limit: the point is to stop a script, and a household booking a clean does not
 * submit twenty quotes a minute. Each one is set well above anything a person
 * does and well below anything an attack needs.
 */
export const RATE_LIMITS = {
  /** Pricing is cheap but it is the easiest endpoint to scrape. */
  quote: { name: "quote", limit: 60, windowSeconds: 60 },
  /** A booking takes a card. Twenty a minute from one client is not a customer. */
  booking: { name: "booking", limit: 20, windowSeconds: 60 },
  /** Sign-in attempts, on top of L5's per-account PIN lockout. */
  auth: { name: "auth", limit: 20, windowSeconds: 300 },
  /** The contact and quote-request forms. */
  lead: { name: "lead", limit: 20, windowSeconds: 300 },
  /**
   * Magic links **to one mailbox**, whoever asks for them.
   *
   * Far tighter than the per-caller rule on purpose. The abuse this stops is a
   * distributed one — many callers pointed at one address — and at the caller
   * rule's 20 per 5 minutes a stranger's inbox could still take 5,760 of our
   * emails a day, which is a deliverability problem for us as much as a
   * nuisance for them. Nobody legitimately needs a sixth sign-in link within
   * half an hour; the five before it are still in the inbox.
   */
  authEmail: { name: "auth-email", limit: 5, windowSeconds: 1_800 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitVerdict {
  allowed: boolean;
  /** Requests left in this window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
  /** What to tell the caller — never a stack trace or a count that helps tuning. */
  message?: string;
}

/**
 * Check and consume one request against a rule.
 *
 * **Fails open.** If the limiter itself errors — the database is briefly
 * unavailable, the table is missing — the request is allowed. A rate limiter
 * that takes the booking form down when it breaks has caused more damage than
 * the abuse it prevents, and the failure is logged so it is not silent.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitVerdict> {
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (rule.windowSeconds * 1000)) * rule.windowSeconds * 1000,
  );
  const key = `${rule.name}:${identifier}:${windowStart.toISOString()}`;
  const resetSeconds = Math.ceil(
    (windowStart.getTime() + rule.windowSeconds * 1000 - now.getTime()) / 1000,
  );

  const expiresAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);

  try {
    // One upsert per request: the increment is atomic, so two concurrent
    // requests cannot both read "9 of 10" and both proceed.
    //
    // The retry covers the one case the upsert does not: two requests opening
    // the SAME window at the same moment can race to create the row, and the
    // loser gets a unique-constraint violation. Without the retry that lands in
    // the catch below, which fails open — so the very first request of a window
    // would be the easiest one to get for free. Second time round the row
    // exists and the update path is taken.
    let row;
    try {
      row = await db.rateLimitCounter.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: { increment: 1 } },
      });
    } catch (conflict) {
      if (!isUniqueViolation(conflict)) throw conflict;
      row = await db.rateLimitCounter.update({ where: { key }, data: { count: { increment: 1 } } });
    }

    const allowed = row.count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - row.count),
      resetSeconds,
      message: allowed
        ? undefined
        : "That's a lot of requests in a short time. Please wait a moment and try again.",
    };
  } catch (error) {
    // Through `reportError`, not `console.error`: the key contains the
    // identifier, which for the sign-in rules is a customer's email address.
    const { describeThrown, reportError } = await import("@/lib/monitoring");
    reportError({
      ...describeThrown(error),
      source: `rate-limit:${rule.name}`,
      message: `limiter failed, allowing the request — ${describeThrown(error).message}`,
    });
    return { allowed: true, remaining: rule.limit, resetSeconds };
  }
}

/** A Postgres unique-constraint violation, as Prisma reports it. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * The identifier to limit on, from request headers.
 *
 * The first address in `x-forwarded-for`, which on Vercel is the client. Falls
 * back to a constant so a request with no address is limited **as a group**
 * rather than not at all — one unidentifiable flood should not get a free pass.
 */
export function rateLimitIdentifier(headers: Headers): string {
  // `x-vercel-forwarded-for` first: Vercel sets it itself and a client cannot
  // prepend to it. `x-forwarded-for` is correct on Vercel too, but only because
  // the edge overwrites it — behind anything that APPENDS instead, its first
  // entry is whatever the caller sent, and a limiter keyed on a value the
  // caller chooses is not a limiter. The order matters more than it looks.
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * The sign-in limit, for the magic-link forms (§13.3: *auth* endpoints).
 *
 * Two keys, not one, because the two abuses are different:
 *
 *  - **per caller** — one client enumerating addresses or hammering the form;
 *  - **per email** — many clients pointed at ONE mailbox, which is a way to
 *    make our mail flood somebody else's inbox and get us marked as spam. It
 *    uses the much tighter `authEmail` rule (5 per half hour) rather than the
 *    caller rule, because the caller rule's 20 per 5 minutes would still allow
 *    thousands of our emails a day into one inbox. The address is lower-cased
 *    so `Fola@` and `fola@` share a bucket.
 *
 * Refused returns the message to show. Both buckets are consumed on every
 * attempt, which is the point: a refusal that resets the count can be waited
 * out one request at a time.
 */
export async function checkSignInRateLimit(
  headers: Headers,
  email: string,
): Promise<string | null> {
  const byCaller = await checkRateLimit(RATE_LIMITS.auth, rateLimitIdentifier(headers));
  const byEmail = await checkRateLimit(RATE_LIMITS.authEmail, email.trim().toLowerCase());
  if (byCaller.allowed && byEmail.allowed) return null;
  // Deliberately the same message either way, and no counts: which bucket ran
  // out is not the caller's business.
  return "Too many sign-in requests. Please wait a few minutes and try again.";
}
