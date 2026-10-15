/**
 * Versioned legal wording (§10.2). The CCR early-commencement consent MUST be
 * stored against the Job with a timestamp, IP and the VERSION of the wording
 * shown, so we can prove what was displayed. Bump the version whenever the text
 * changes; never edit an existing version's text in place.
 */

export const CCR_CONSENT = {
  version: "2026-09-04.1",
  /** Mandatory, unticked at the payment step (§10.2). */
  text:
    "I request that the cleaning service begins before the end of the 14-day cancellation period, and I understand that I will lose my right to cancel once the service has been fully performed.",
} as const;

/** Pre-contract information required in a durable medium (§10.2). */
export const preContractPoints = [
  "The total price you will pay, inclusive of VAT where applicable",
  "Our cancellation policy and any cancellation or no-access fees",
  "How to raise a complaint and our re-clean guarantee",
  "Our trading name, company number and registered address",
];

/**
 * Card on file (SETUP decision **D7 = A**, PRD §8, §16.1 gap 2).
 *
 * D7 = A means the customer's card is saved at booking and charged
 * automatically on completion for any booking more than about six days ahead and
 * for every recurring visit. That changes what the customer agrees to at
 * checkout — they are consenting to a later charge they will not be present for
 * — so it is **legal wording**, which `CLAUDE.md` makes a Park item: drafted
 * here, not shipped.
 *
 * `confirmed: false` is load-bearing, not a placeholder. While it is false the
 * booking flow keeps the existing behaviour (authorise now, and a manual payment
 * request when a hold has lapsed), so nothing new is ever shown to or charged
 * from a customer on wording nobody approved. Setting it to `true` is the single
 * switch that turns mechanism A on — raised as **Q-14** in `PROGRESS.md`.
 *
 * The draft below is written to the two things the mechanism actually needs: the
 * CCR pre-contract duty to say what will be charged and when, and Stripe's
 * requirement that the customer agreed to the merchant storing and reusing the
 * card off-session. It has not been reviewed by anyone qualified.
 */
export const CARD_ON_FILE_CONSENT = {
  version: "2026-10-15.1-draft",
  /** Fola (or an adviser) sets this true. Until then mechanism A stays off. */
  confirmed: false,
  /** TODO(legal) — draft wording, unapproved. Do not render while unconfirmed. */
  text:
    "I authorise MCS Eco Cleaning to store my card details and to charge this card " +
    "for the agreed price of each visit once that visit has been completed. I will " +
    "receive a receipt by email after each charge, and I can remove my card or " +
    "cancel at any time from my account.",
  /** Shown beside the price when the card will be charged later rather than held. */
  summary:
    "TODO(legal) — we'll save your card securely with Stripe and charge it after your " +
    "clean is finished, not today.",
} as const;
