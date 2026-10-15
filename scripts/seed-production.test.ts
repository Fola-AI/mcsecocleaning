import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { checkProductionSeed } from "./seed-production";

/**
 * The refusals, tested here rather than discovered on launch day. The script
 * writes to a real database, so every way of running it by accident should fail
 * before it connects.
 */
const PROD_URL = "postgresql://u:p@ep-prod-123.eu-west-2.aws.neon.tech/neondb";
const DEV_HOST = "ep-dev-456.eu-west-2.aws.neon.tech";

describe("the production seed asks to be meant", () => {
  test("proceeds when confirmed, in production, with a readable host", () => {
    const verdict = checkProductionSeed({
      appEnv: "production",
      confirm: "yes",
      databaseUrl: PROD_URL,
      devDbHost: DEV_HOST,
    });
    assert.deepEqual(verdict, { ok: true, host: "ep-prod-123.eu-west-2.aws.neon.tech" });
  });

  test("refuses without the typed confirmation", () => {
    for (const confirm of [undefined, "", "y", "YES", "true"]) {
      const verdict = checkProductionSeed({ appEnv: "production", confirm, databaseUrl: PROD_URL });
      assert.equal(verdict.ok, false, `confirm=${String(confirm)} must not pass`);
      assert.match(verdict.reason!, /CONFIRM_PRODUCTION_SEED/);
    }
  });

  test("refuses unless APP_ENV says production", () => {
    const verdict = checkProductionSeed({ appEnv: "development", confirm: "yes", databaseUrl: PROD_URL });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /APP_ENV/);
  });

  test("refuses the dev branch even when confirmed", () => {
    // A "production" seed aimed at dev is a mistake every time, and a confusing
    // one to debug.
    const verdict = checkProductionSeed({
      appEnv: "production",
      confirm: "yes",
      databaseUrl: `postgresql://u:p@${DEV_HOST}/neondb`,
      devDbHost: DEV_HOST,
    });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /DEV_DB_HOST/);
  });

  test("refuses the dev branch via its pooled hostname too", () => {
    // Neon serves one branch on two hostnames; the pooled one has `-pooler`
    // inserted. A literal comparison would miss it.
    const verdict = checkProductionSeed({
      appEnv: "production",
      confirm: "yes",
      databaseUrl: "postgresql://u:p@ep-dev-456-pooler.eu-west-2.aws.neon.tech/neondb",
      devDbHost: DEV_HOST,
    });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /dev branch/);
  });

  test("refuses with no connection string, or an unreadable one", () => {
    assert.equal(checkProductionSeed({ appEnv: "production", confirm: "yes" }).ok, false);
    assert.equal(
      checkProductionSeed({ appEnv: "production", confirm: "yes", databaseUrl: "not-a-url" }).ok,
      false,
    );
  });
});
