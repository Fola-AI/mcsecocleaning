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
