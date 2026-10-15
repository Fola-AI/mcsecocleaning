/**
 * Error reporting (§13.3, SETUP §3.9, PRD §16.3 → L14).
 *
 * ## Why this exists rather than Sentry
 *
 * SETUP §3.9 asks for Sentry at L14. There is no Sentry project and no DSN, so
 * installing the SDK would add a dependency that reports to nowhere and cannot
 * be verified. What a production app actually needs on day one is that a server
 * error leaves a record somewhere a person will look — on Vercel that is the
 * function log — and that the record does not contain anything it must not.
 *
 * So: one structured line per error, written through a single function. When the
 * DSN arrives, `reportError` is the one place that changes.
 *
 * ## Redaction is the point
 *
 * `CLAUDE.md` forbids an access code in "any log, email, SMS, error or analytics
 * payload", and an error message is the easiest way for one to escape: a thrown
 * database error can carry the row that caused it. The redaction below runs on
 * every message and every stack before anything is written, so a new call site
 * cannot forget it.
 */

/** Patterns that must never be written out, with what replaces them. */
const REDACTIONS: Array<[RegExp, string]> = [
  // Encrypted access-code payloads (`v1:<iv>.<tag>.<ciphertext>`) and anything
  // shaped like one. The ciphertext is not readable, but a log is not where it
  // belongs either, and the shape is distinctive.
  [/\bv1:[A-Za-z0-9+/=]{8,}\.[A-Za-z0-9+/=]{8,}\.[A-Za-z0-9+/=]+/g, "[access-code]"],
  // Provider keys and secrets, in case one is ever interpolated into a message.
  [/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]{8,}/g, "[key]"],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, "[key]"],
  [/\bre_[A-Za-z0-9]{12,}/g, "[key]"],
  [/\bSG\.[A-Za-z0-9._-]{16,}/g, "[key]"],
  // Bearer tokens and basic-auth pairs from a stringified request.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [token]"],
  // Credentials in a URL, whatever the scheme: Postgres today, `redis://` the
  // moment SETUP D5 is answered "Upstash", and `https://user:pass@host` for an
  // internal service. Matching the scheme generally is the difference between
  // redacting the password and redacting the one scheme somebody thought of.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+:[^@\s/]+@/gi, "$1[credentials]@"],
  // A four-to-ten digit code near the words we use for them. The separator is
  // deliberately loose — quotes, colons, spaces, `=>` — because the first
  // version allowed only `[:=]` and so missed `accessCode: "483912"`, which is
  // exactly how Prisma prints a failing argument and therefore the most likely
  // shape of all. Still narrow on the digits: a bare number could be anything,
  // and a log that redacts everything is not a log.
  [
    /\b((?:access|alarm|lockbox|door|entry|key(?:pad)?|pin|code)[A-Za-z]*\s*["'`:=>\s]{0,6}(?:(?:is|was)\s+)?)\d{4,10}\b/gi,
    "$1[redacted]",
  ],
  // A session cookie is a usable handle on somebody's account for as long as it
  // lives — 30 days for a crew member. Auth.js uses database sessions here, so
  // the value in the cookie IS the session.
  [/\b(__Secure-)?(authjs|next-auth)\.[A-Za-z.-]*token=\s*[^;\s"']+/gi, "[session-cookie]"],
  [/\b(Set-Cookie|Cookie):\s*[^\n]+/gi, "$1: [cookies]"],
  // `NAME=<opaque value>` for the names that must never be written out. A key
  // with no recognisable prefix — `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY` — cannot
  // be matched by its shape, only by the name next to it, and "the key is
  // wrong, got X" is precisely the message somebody writes while debugging one.
  [
    new RegExp(
      `\\b(${[
        "ACCESS_CODE_ENC_KEY",
        "AUTH_SECRET",
        "MEDIA_LINK_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "RESEND_API_KEY",
        "TWILIO_AUTH_TOKEN",
        "R2_SECRET_ACCESS_KEY",
        "SENTRY_AUTH_TOKEN",
        "UPSTASH_REDIS_REST_TOKEN",
        "DATABASE_URL",
        "DIRECT_URL",
        "CREW_PIN_PEPPER",
      ].join("|")})\\s*[:=]\\s*["']?[^\\s"',}]+["']?`,
      "gi",
    ),
    "$1=[redacted]",
  ],
  // Email addresses: the local part is enough to identify a person and is not
  // needed to debug. The domain stays, because "a gmail address" is useful.
  [/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "[email]@$1"],
];

/** Strip anything that must not be written to a log. Safe on any string. */
export function redactForReport(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

export interface ErrorReport {
  message: string;
  /** React's error digest, when the error came through a server component. */
  digest?: string;
  /** The route or path, never the query string — see below. */
  path?: string;
  /** "render", "route", "action", "cron" … whatever the caller knows. */
  source?: string;
  stack?: string;
}

/**
 * Build the line that gets written.
 *
 * Separated from writing it so it can be tested without capturing console
 * output. The query string is dropped rather than redacted: it is the one place
 * personal data ends up by accident, and no error needs it.
 */
export function formatErrorReport(report: ErrorReport): string {
  const path = report.path ? report.path.split("?")[0] : undefined;
  const payload = {
    level: "error",
    at: new Date().toISOString(),
    source: report.source ?? "unknown",
    path,
    digest: report.digest,
    message: redactForReport(report.message),
    // First few frames only. A full stack in a log line is unreadable, and the
    // frames that matter are at the top.
    stack: report.stack
      ? redactForReport(report.stack).split("\n").slice(0, 6).join(" | ")
      : undefined,
  };
  return `[error] ${JSON.stringify(payload)}`;
}

/**
 * Report one error.
 *
 * Never throws: a reporter that fails while reporting turns one error into two,
 * and the second one has no context at all.
 */
export function reportError(report: ErrorReport): void {
  try {
    console.error(formatErrorReport(report));
  } catch {
    // Deliberately empty.
  }
}

/** Pull the useful fields off whatever was thrown. */
export function describeThrown(error: unknown): { message: string; digest?: string; stack?: string } {
  if (error instanceof Error) {
    const digest = "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;
    return { message: error.message, digest, stack: error.stack };
  }
  if (typeof error === "object" && error !== null) {
    const digest = "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;
    // `String({})` is "[object Object]", which tells nobody anything. JSON is
    // not guaranteed (a cycle, a BigInt), hence the fallback.
    let message: string;
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = String(error);
    }
    return { message, digest };
  }
  return { message: String(error) };
}
