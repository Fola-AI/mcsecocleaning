/**
 * What the admin can do with a job's payment link (PRD §16.3 → L2; deferred from
 * Phase 2, where the link was created but never recoverable afterwards).
 *
 * The problem it solves is small and ordinary: an admin creates a booking with a
 * payment link, the customer loses the email, and the admin has no way to get the
 * link back. The Checkout Session id was already being stored on the Payment row
 * (that is how a cancellation expires an unpaid link), so the link can be fetched
 * back — but only while the session is open. Stripe expires sessions after ~24
 * hours, and an expired link cannot be revived; a new session has to be minted,
 * superseding the old rows.
 *
 * The decision is pure and lives here so the three states, and the reasons for
 * them, are unit-tested rather than tangled into a component.
 */

export type PaymentLinkAction =
  /** The session is open: show the URL to copy. */
  | "copy"
  /** Expired or unknown: offer a fresh link, which supersedes the old rows. */
  | "reissue"
  /** The customer already paid through it — nothing to send. */
  | "paid"
  /** Nothing outstanding, or no link was ever created for this job. */
  | "none";

export interface PaymentLinkRow {
  status: string;
  stripeCheckoutSessionId: string | null;
}

/**
 * The link state for a job, from its charge rows plus (optionally) what Stripe
 * says about the stored session.
 *
 * `sessionStatus` is undefined when Stripe has not been asked — the admin page
 * renders a row per job and must not make a Stripe call for each one on load, so
 * the list shows "reissue or copy" and the actual session is read only when the
 * admin asks for the link.
 */
export function paymentLinkAction(
  rows: PaymentLinkRow[],
  sessionStatus?: "open" | "expired" | "complete",
): PaymentLinkAction {
  const outstanding = rows.filter((r) => r.status === "pending" || r.status === "failed");
  if (outstanding.length === 0) return "none";

  const withSession = outstanding.find((r) => r.stripeCheckoutSessionId);
  if (!withSession) return "reissue"; // outstanding money, but no link was ever made

  if (sessionStatus === "complete") return "paid";
  if (sessionStatus === "expired") return "reissue";
  if (sessionStatus === "open") return "copy";
  return "copy"; // not yet checked — asking Stripe is what resolves it
}

/** The session id to read back for a job, if there is one. */
export function storedSessionId(rows: PaymentLinkRow[]): string | null {
  const outstanding = rows.filter((r) => r.status === "pending" || r.status === "failed");
  return outstanding.find((r) => r.stripeCheckoutSessionId)?.stripeCheckoutSessionId ?? null;
}
