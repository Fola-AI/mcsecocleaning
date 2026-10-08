import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideEmailRecipients,
  decideSmsRecipients,
  isProduction,
  redirectSubjectPrefix,
} from "./outbound-guard";

/**
 * The guard fails closed, so the tests that matter are the ones proving a real
 * address is unreachable from a non-production environment — including when
 * `APP_ENV` is simply missing, which is the state of this repo today.
 */

const CUSTOMER = "real.customer@example.com";
const DEV_INBOX = "fola@example.com";

describe("isProduction", () => {
  test("only the exact string counts", () => {
    assert.equal(isProduction({ appEnv: "production" }), true);
    assert.equal(isProduction({ appEnv: "PRODUCTION" }), true, "case is tolerated");
    assert.equal(isProduction({ appEnv: " production " }), true, "whitespace is tolerated");
  });

  test("anything else, including unset, is non-production", () => {
    assert.equal(isProduction({}), false);
    assert.equal(isProduction({ appEnv: "" }), false);
    assert.equal(isProduction({ appEnv: "preview" }), false);
    assert.equal(isProduction({ appEnv: "prod" }), false, '"prod" is not "production"');
    assert.equal(isProduction({ appEnv: "development" }), false);
  });
});

describe("email — a real recipient is unreachable outside production", () => {
  test("APP_ENV unset and no redirect: logged, never sent", () => {
    const d = decideEmailRecipients({}, CUSTOMER);
    assert.equal(d.action, "log");
    assert.deepEqual(d.intendedFor, [CUSTOMER]);
  });

  test("APP_ENV unset with a redirect: goes to the dev inbox only", () => {
    const d = decideEmailRecipients({ devEmailRedirect: DEV_INBOX }, CUSTOMER);
    assert.equal(d.action, "redirect");
    assert.deepEqual(d.to, [DEV_INBOX]);
    assert.deepEqual(d.intendedFor, [CUSTOMER]);
  });

  test("several recipients collapse to one dev address — no fan-out in dev", () => {
    const d = decideEmailRecipients(
      { appEnv: "development", devEmailRedirect: DEV_INBOX },
      [CUSTOMER, "second@example.com", "third@example.com"]
    );
    assert.equal(d.action, "redirect");
    assert.deepEqual(d.to, [DEV_INBOX]);
    assert.equal(d.intendedFor.length, 3);
  });

  test("preview is not production", () => {
    const d = decideEmailRecipients({ appEnv: "preview", devEmailRedirect: DEV_INBOX }, CUSTOMER);
    assert.equal(d.action, "redirect");
  });

  test("a blank redirect is treated as absent, not as an empty address", () => {
    const d = decideEmailRecipients({ devEmailRedirect: "   " }, CUSTOMER);
    assert.equal(d.action, "log");
  });

  test("no decision outside production ever contains the real address in `to`", () => {
    const envs = [
      {},
      { appEnv: "development" },
      { appEnv: "preview", devEmailRedirect: DEV_INBOX },
      { devEmailRedirect: DEV_INBOX },
    ];
    for (const env of envs) {
      const d = decideEmailRecipients(env, CUSTOMER);
      const recipients = d.action === "log" ? [] : d.to;
      assert.ok(
        !recipients.includes(CUSTOMER),
        `${JSON.stringify(env)} leaked the real recipient`
      );
    }
  });
});

describe("email — production delivers normally", () => {
  test("real recipients are used", () => {
    const d = decideEmailRecipients({ appEnv: "production" }, CUSTOMER);
    assert.equal(d.action, "send");
    assert.deepEqual(d.to, [CUSTOMER]);
  });

  test("a dev redirect set in production is ignored", () => {
    const d = decideEmailRecipients(
      { appEnv: "production", devEmailRedirect: DEV_INBOX },
      CUSTOMER
    );
    assert.equal(d.action, "send");
    assert.deepEqual(d.to, [CUSTOMER]);
  });

  test("multiple recipients are preserved", () => {
    const d = decideEmailRecipients({ appEnv: "production" }, [CUSTOMER, "ops@example.com"]);
    assert.equal(d.action, "send");
    assert.equal(d.to.length, 2);
  });
});

describe("email — degenerate input", () => {
  test("no recipient is logged, not sent, even in production", () => {
    assert.equal(decideEmailRecipients({ appEnv: "production" }, "").action, "log");
    assert.equal(decideEmailRecipients({ appEnv: "production" }, []).action, "log");
    assert.equal(decideEmailRecipients({ appEnv: "production" }, ["  "]).action, "log");
  });

  test("blank entries are dropped from a list", () => {
    const d = decideEmailRecipients({ appEnv: "production" }, [CUSTOMER, "", "  "]);
    assert.equal(d.action, "send");
    assert.deepEqual(d.to, [CUSTOMER]);
  });
});

describe("sms — same rule", () => {
  test("logged when nothing is configured", () => {
    assert.equal(decideSmsRecipients({}, "+447700900000").action, "log");
  });

  test("redirected to the verified dev number", () => {
    const d = decideSmsRecipients({ devSmsRedirect: "+447700900999" }, "+447700900000");
    assert.equal(d.action, "redirect");
    assert.deepEqual(d.to, ["+447700900999"]);
  });

  test("sent for real in production", () => {
    const d = decideSmsRecipients({ appEnv: "production" }, "+447700900000");
    assert.equal(d.action, "send");
  });

  test("the email redirect does not stand in for the SMS one", () => {
    const d = decideSmsRecipients({ devEmailRedirect: DEV_INBOX }, "+447700900000");
    assert.equal(d.action, "log");
  });
});

describe("redirectSubjectPrefix", () => {
  test("names the intended recipient", () => {
    assert.equal(redirectSubjectPrefix([CUSTOMER]), `[dev → ${CUSTOMER}]`);
  });

  test("summarises a long list rather than printing all of it", () => {
    const prefix = redirectSubjectPrefix(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    assert.equal(prefix, "[dev → a@x.com, b@x.com +2]");
  });
});
