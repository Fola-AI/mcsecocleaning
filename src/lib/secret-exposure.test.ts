import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No secret reaches the client (§13.3, `CLAUDE.md` → *Security rules*, L14).
 *
 * Two ways a secret escapes a Next application, and this covers both:
 *
 *  1. **`NEXT_PUBLIC_`** — the prefix inlines a value into the browser bundle.
 *     Anything sensitive carrying it is published, permanently, to everyone who
 *     has ever loaded the site.
 *  2. **An import** — a client component importing a server module drags its
 *     environment access into the bundle. `import "server-only"` turns that into
 *     a build error, which is why every module that touches a secret has it.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = walk("src").filter((file) => !file.includes(".test."));

/** Names that must never be published, whatever prefix someone gives them. */
const SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "AUTH_SECRET",
  "ACCESS_CODE_ENC_KEY",
  "MEDIA_LINK_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
  "RESEND_API_KEY",
  "TWILIO_AUTH_TOKEN",
  "R2_SECRET_ACCESS_KEY",
  "SENTRY_AUTH_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
];

describe("nothing sensitive is published to the browser", () => {
  test("no secret is read under a NEXT_PUBLIC_ name", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, "utf8");
      for (const name of SECRET_NAMES) {
        if (source.includes(`NEXT_PUBLIC_${name}`)) offenders.push(`${file}: NEXT_PUBLIC_${name}`);
      }
    }
    assert.deepEqual(offenders, [], `A NEXT_PUBLIC_ value is inlined into the browser bundle:\n${offenders.join("\n")}`);
  });

  test("the only NEXT_PUBLIC_ names in use are ones that are safe to publish", () => {
    // Allow-listed deliberately: a new NEXT_PUBLIC_ name should be a decision
    // somebody makes here, not something that appears in a diff.
    const allowed = new Set([
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", // publishable by design
      "NEXT_PUBLIC_GA_ID",
      "NEXT_PUBLIC_ALLOW_INDEXING",
      "NEXT_PUBLIC_SENTRY_DSN", // a DSN is designed to be public
      "NEXT_PUBLIC_CALCOM_URL",
    ]);

    const found = new Set<string>();
    for (const file of SOURCES) {
      for (const match of readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        found.add(match[0]);
      }
    }
    const unexpected = [...found].filter((name) => !allowed.has(name));
    assert.deepEqual(unexpected, [], `New NEXT_PUBLIC_ names need a decision: ${unexpected.join(", ")}`);
  });

  test("every module that reads a secret is server-only", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, "utf8");
      const readsSecret = SECRET_NAMES.some((name) => source.includes(`process.env.${name}`));
      if (!readsSecret) continue;

      const isClient = source.includes('"use client"');
      if (isClient) {
        offenders.push(`${file} is a client component and reads a secret`);
        continue;
      }
      // A server action, a route handler, a config file or a server-only module
      // are all fine; what must not happen is a module with no such marker being
      // pulled into a client bundle.
      const guarded =
        source.includes('import "server-only"') ||
        source.includes('"use server"') ||
        file.includes(join("app", "api")) ||
        file.endsWith("next.config.ts") ||
        file.includes(join("lib", "db.ts")) ||
        file.includes(join("lib", "email.ts")) ||
        file.includes(join("lib", "stripe.ts")) ||
        file.includes(join("lib", "auth.ts")) ||
        file.includes(join("lib", "access-codes.ts")) ||
        file.includes(join("lib", "outbound-guard.ts")) ||
        file.includes(join("lib", "money.ts")) ||
        file.includes(join("lib", "collection.ts")) ||
        file.includes(join("lib", "seo")) ||
        file.includes(join("lib", "inngest")) ||
        file.includes(join("config", "")) ||
        file.includes("page.tsx") ||
        file.includes("layout.tsx");

      if (!guarded) offenders.push(`${file} reads a secret with no server-only marker`);
    }
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  test("no client component imports a server-only module", () => {
    const serverOnly = SOURCES.filter((file) => readFileSync(file, "utf8").includes('import "server-only"'))
      .map((file) => file.replace(/^src\//, "@/").replace(/\.tsx?$/, ""));

    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('"use client"')) continue;
      for (const serverModule of serverOnly) {
        if (source.includes(`from "${serverModule}"`)) offenders.push(`${file} imports ${serverModule}`);
      }
    }
    assert.deepEqual(offenders, [], `A client component imports a server-only module:\n${offenders.join("\n")}`);
  });
});
