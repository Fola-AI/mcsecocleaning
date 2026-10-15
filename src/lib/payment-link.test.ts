import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { paymentLinkAction, storedSessionId, type PaymentLinkRow } from "./payment-link";

const pending = (sessionId: string | null = "cs_1"): PaymentLinkRow => ({
  status: "pending",
  stripeCheckoutSessionId: sessionId,
});

describe("paymentLinkAction", () => {
  test("nothing outstanding → nothing to send", () => {
    assert.equal(paymentLinkAction([{ status: "captured", stripeCheckoutSessionId: "cs_1" }]), "none");
    assert.equal(paymentLinkAction([]), "none");
  });

  test("outstanding money but no link was ever created → reissue", () => {
    assert.equal(paymentLinkAction([pending(null)]), "reissue");
  });

  test("an open session → copy its URL", () => {
    assert.equal(paymentLinkAction([pending()], "open"), "copy");
  });

  test("an expired session → reissue, because an expired link cannot be revived", () => {
    assert.equal(paymentLinkAction([pending()], "expired"), "reissue");
  });

  test("a completed session → paid, never a new link", () => {
    // Minting a second link for money already paid is how a customer gets charged
    // twice. The reconciliation may not have landed yet, so this is explicit.
    assert.equal(paymentLinkAction([pending()], "complete"), "paid");
  });

  test("a failed row still counts as outstanding", () => {
    assert.equal(
      paymentLinkAction([{ status: "failed", stripeCheckoutSessionId: "cs_9" }], "expired"),
      "reissue",
    );
  });

  test("before Stripe has been asked, the row offers the link", () => {
    // The jobs list renders many rows; a Stripe call per row on page load would
    // make the page slow and rate-limited. The session is read on demand.
    assert.equal(paymentLinkAction([pending()]), "copy");
  });
});

describe("storedSessionId", () => {
  test("returns the session on an outstanding row", () => {
    assert.equal(storedSessionId([pending("cs_42")]), "cs_42");
  });

  test("ignores sessions on settled rows", () => {
    assert.equal(
      storedSessionId([{ status: "captured", stripeCheckoutSessionId: "cs_old" }]),
      null,
      "a captured row's session must not be offered as a live link",
    );
  });
});
