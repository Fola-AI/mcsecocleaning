/**
 * Subject access and erasure (§14.3, UK GDPR, PRD §16.3 → L13).
 *
 * The hard part of erasure is not deleting things, it is knowing what must
 * **stay**. Deleting an invoice to honour an erasure request breaks a different
 * law: HMRC requires six years of records, and the lawful basis for keeping them
 * is a legal obligation, which survives a right-to-erasure request. The right
 * answer is to **anonymise**: strip the person out and leave the transaction.
 *
 * So this module is written as two explicit lists — what is erased, and what is
 * kept and why — because the second list is the one that gets forgotten and the
 * one an auditor asks about.
 */

/** What an erasure removes from the record. */
export const ERASED_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "access codes (lockbox and alarm)",
  "property notes, pets and product preferences",
  "marketing consent state",
] as const;

/**
 * What survives an erasure, and the reason each one does.
 *
 * Every entry needs a lawful basis that outranks the erasure request, and
 * "we might want it" is not one.
 */
export const RETAINED_AFTER_ERASURE: { what: string; why: string }[] = [
  {
    what: "Invoices, payments and refunds (amounts, dates, references)",
    why: "Legal obligation — HMRC requires six years of records. Erasure does not override it.",
  },
  {
    what: "The jobs themselves, anonymised (date, service, price, duration)",
    why: "They are the other half of a financial record, and they carry no personal data once the customer is anonymised.",
  },
  {
    what: "Access-code audit rows",
    why: "They record WHO opened a property and when — a security record about our own staff. The codes themselves are erased; the fact that somebody opened a door is not personal data about the customer.",
  },
  {
    what: "An anonymised customer row",
    why: "Deleting it would orphan every financial record that points at it. The row stays with its identifying fields blanked, which is what anonymisation means.",
  },
];

/** The anonymised stand-in for a person, so a record is readable without identifying anyone. */
export function anonymisedIdentity(userId: string): { email: string; name: string } {
  // Derived from the id, so two erased customers stay distinguishable in the
  // records that still reference them — and the address is unroutable.
  const token = userId.slice(-8);
  return { email: `erased-${token}@erased.invalid`, name: "Erased customer" };
}

export interface ErasureCheck {
  ok: boolean;
  reason?: string;
}

/**
 * May this customer be erased yet?
 *
 * Refused while there is money outstanding or work still to do. Not to be
 * obstructive — erasure is a right — but because erasing a customer with a job
 * next Tuesday means a crew turning up at a house with no contact details, and
 * because an unpaid invoice we can no longer explain is a worse outcome for
 * everyone than a short delay and a conversation.
 */
export function canErase(customer: {
  upcomingJobs: number;
  outstandingPence: number;
}): ErasureCheck {
  if (customer.upcomingJobs > 0) {
    return {
      ok: false,
      reason:
        "They have a visit booked. Cancel or complete it first — otherwise a crew arrives at a house with no way to contact anyone.",
    };
  }
  if (customer.outstandingPence > 0) {
    return {
      ok: false,
      reason:
        "There is money outstanding. Settle or write it off first, so the financial record that has to be kept still makes sense.",
    };
  }
  return { ok: true };
}

export interface SubjectAccessExport {
  generatedAt: string;
  about: { name: string | null; email: string; phone: string | null };
  properties: unknown[];
  bookings: unknown[];
  payments: unknown[];
  subscriptions: unknown[];
  messages: unknown[];
  consent: { marketing: boolean; updatedAt: string | null };
  /** Stated plainly, because an export that silently omits things is not one. */
  notIncluded: string[];
}

/**
 * What a subject-access export says about its own limits.
 *
 * An export that quietly leaves things out is not a complete answer to the
 * request, so it says what it does not contain and why.
 */
export const SAR_EXCLUSIONS = [
  "Access codes for your property — these are encrypted and are never readable, including by us, outside a crew's visit window.",
  "Card details — these are held by Stripe, our payment processor, and never reach our systems.",
  "Internal notes that identify another person, which we are not required to disclose.",
];
