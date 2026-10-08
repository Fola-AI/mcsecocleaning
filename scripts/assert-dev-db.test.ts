import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkDevDatabase,
  hostFromConnectionString,
  normaliseNeonHost,
} from "./assert-dev-db";

/**
 * The guard is deny-by-default, so most of these tests assert a refusal. The
 * one that matters most is "pooled host matches the direct DEV_DB_HOST": get
 * that wrong and the guard either blocks every legitimate command (and gets
 * disabled by whoever is in a hurry) or waves through the wrong branch.
 */

const DIRECT = "ep-cool-rain-12345678.c-2.eu-west-2.aws.neon.tech";
const POOLED = "ep-cool-rain-12345678-pooler.c-2.eu-west-2.aws.neon.tech";

const ok = {
  databaseUrl: `postgresql://neondb_owner:secret@${POOLED}/neondb?sslmode=require`,
  directUrl: `postgresql://neondb_owner:secret@${DIRECT}/neondb?sslmode=require`,
  devDbHost: DIRECT,
  appEnv: "development",
};

describe("hostFromConnectionString", () => {
  test("reads the host from a normal string", () => {
    assert.equal(hostFromConnectionString(`postgresql://u:p@${DIRECT}/neondb`), DIRECT);
  });

  test("strips the port", () => {
    assert.equal(hostFromConnectionString("postgresql://u:p@db.example.com:5432/x"), "db.example.com");
  });

  test("a password containing @ does not shift the host", () => {
    // The last @ separates credentials from the authority; passwords may hold @.
    assert.equal(
      hostFromConnectionString(`postgresql://user:p@ss@w0rd@${DIRECT}/neondb`),
      DIRECT
    );
  });

  test("a password containing / and ? does not swallow the host", () => {
    const host = hostFromConnectionString("postgresql://user:a/b?c@db.example.com:5432/x");
    assert.equal(host, "db.example.com");
  });

  test("lowercases the host", () => {
    assert.equal(hostFromConnectionString("postgresql://u:p@DB.Example.COM/x"), "db.example.com");
  });

  test("null for empty or hostless strings", () => {
    assert.equal(hostFromConnectionString(""), null);
    assert.equal(hostFromConnectionString("   "), null);
  });

  test("an unparseable host is null, never a partial match", () => {
    // Deny-by-default: whatever we cannot read confidently must not be treated
    // as a host, because checkDevDatabase would then compare the wrong thing.
    assert.equal(hostFromConnectionString("postgresql://"), null);
    assert.equal(hostFromConnectionString("not a url at all"), null);
  });
});

describe("normaliseNeonHost", () => {
  test("pooled and direct Neon hosts normalise to the same value", () => {
    assert.equal(normaliseNeonHost(POOLED), normaliseNeonHost(DIRECT));
  });

  test("leaves a non-Neon host alone", () => {
    assert.equal(normaliseNeonHost("db.example.com"), "db.example.com");
  });

  test("does not strip -pooler from the middle of a label", () => {
    // Only a trailing -pooler on a label is Neon's endpoint marker.
    assert.equal(normaliseNeonHost("ep-pooler-ish.example.com"), "ep-pooler-ish.example.com");
  });
});

describe("checkDevDatabase — permits only the dev branch", () => {
  test("pooled DATABASE_URL + direct DIRECT_URL against the direct DEV_DB_HOST", () => {
    const v = checkDevDatabase(ok);
    assert.equal(v.ok, true, v.reason);
    assert.equal(v.host, normaliseNeonHost(DIRECT));
  });

  test("DEV_DB_HOST given as the pooled host still works", () => {
    assert.equal(checkDevDatabase({ ...ok, devDbHost: POOLED }).ok, true);
  });
});

describe("checkDevDatabase — refusals", () => {
  test("no DEV_DB_HOST is a refusal, not a pass", () => {
    const v = checkDevDatabase({ ...ok, devDbHost: undefined });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /DEV_DB_HOST is not set/);
  });

  test("blank DEV_DB_HOST is a refusal", () => {
    assert.equal(checkDevDatabase({ ...ok, devDbHost: "   " }).ok, false);
  });

  test("a different Neon branch is refused", () => {
    const other = "ep-other-branch-87654321.c-2.eu-west-2.aws.neon.tech";
    const v = checkDevDatabase({
      ...ok,
      databaseUrl: `postgresql://u:p@${other}/neondb`,
      directUrl: `postgresql://u:p@${other}/neondb`,
    });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /not the dev database/);
  });

  test("a mismatch in only ONE of the two URLs is still refused", () => {
    const other = "ep-production-99999999.c-2.eu-west-2.aws.neon.tech";
    // DATABASE_URL is right, DIRECT_URL is production — migrations use DIRECT_URL.
    const v = checkDevDatabase({ ...ok, directUrl: `postgresql://u:p@${other}/neondb` });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /DIRECT_URL/);
  });

  test("the localhost placeholder is named as a placeholder", () => {
    const v = checkDevDatabase({
      ...ok,
      databaseUrl: "postgresql://user:password@localhost:5432/mcseco?schema=public",
      directUrl: "postgresql://user:password@localhost:5432/mcseco?schema=public",
      devDbHost: "localhost",
    });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /placeholder/);
  });

  test("a connection string whose host cannot be read is refused", () => {
    const v = checkDevDatabase({
      ...ok,
      databaseUrl: "postgresql://",
      directUrl: "postgresql://",
    });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /no host could be read/);
  });

  test("a missing URL permits nothing", () => {
    assert.equal(checkDevDatabase({ ...ok, databaseUrl: undefined }).ok, false);
    assert.equal(checkDevDatabase({ ...ok, directUrl: "" }).ok, false);
  });

  test('APP_ENV="production" is refused even when the hosts match', () => {
    const v = checkDevDatabase({ ...ok, appEnv: "production" });
    assert.equal(v.ok, false);
    assert.match(v.reason!, /APP_ENV/);
  });

  test("APP_ENV is matched case-insensitively", () => {
    assert.equal(checkDevDatabase({ ...ok, appEnv: "Production" }).ok, false);
  });

  test("the repo's current state — stale .env, no DEV_DB_HOST — is refused", () => {
    const v = checkDevDatabase({
      databaseUrl: "postgresql://user:password@localhost:5432/mcseco?schema=public",
      directUrl: "",
      devDbHost: undefined,
      appEnv: undefined,
    });
    assert.equal(v.ok, false);
  });
});
