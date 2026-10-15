import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { decideSend } from "./policy";
import { marketingTriggers } from "./registry";

/**
 * The PECR gate (§10.3, §14). Both directions matter: gate a booking
 * confirmation and the customer never learns their clean is booked; fail to
 * gate a review request and it is a breach.
 */

describe("marketing needs consent", () => {
  test("every marketing trigger is withheld without it", () => {
    for (const trigger of marketingTriggers()) {
      const decision = decideSend({ trigger: trigger.id, to: "a@example.test", marketingConsent: false });
      assert.equal(decision.send, false, trigger.id);
      assert.equal(decision.send === false && decision.outcome, "skipped_no_consent");
    }
  });

  test("and sent with it", () => {
    for (const trigger of marketingTriggers()) {
      assert.equal(
        decideSend({ trigger: trigger.id, to: "a@example.test", marketingConsent: true }).send,
        true,
        trigger.id,
      );
    }
  });

  test("a missing consent field reads as NO consent", () => {
    // A caller that forgot to load the column must fail safe. The cost of a
    // withheld review request is one fewer review; the cost of the opposite is
    // a breach.
    for (const trigger of marketingTriggers()) {
      assert.equal(decideSend({ trigger: trigger.id, to: "a@example.test" }).send, false, trigger.id);
    }
  });
});

describe("transactional messages are not gated", () => {
  test("a reminder goes out to someone who has opted out of marketing", () => {
    const decision = decideSend({
      trigger: "reminder_24h",
      to: "a@example.test",
      marketingConsent: false,
    });
    assert.equal(decision.send, true);
  });

  test("so does the pre-contract information — it is a legal duty", () => {
    assert.equal(
      decideSend({ trigger: "pre_contract", to: "a@example.test", marketingConsent: false }).send,
      true,
    );
  });
});

describe("the obvious failures", () => {
  test("no recipient is not a send", () => {
    for (const to of [null, undefined, "", "   "]) {
      const decision = decideSend({ trigger: "reminder_24h", to, marketingConsent: true });
      assert.equal(decision.send, false);
      assert.equal(decision.send === false && decision.outcome, "skipped_no_recipient");
    }
  });

  test("an unknown trigger is refused rather than guessed at", () => {
    // Guessing would mean deciding the PECR question for a message nobody
    // classified.
    const decision = decideSend({ trigger: "not_a_trigger", to: "a@example.test" });
    assert.equal(decision.send, false);
    assert.equal(decision.send === false && decision.outcome, "unknown_trigger");
  });
});
