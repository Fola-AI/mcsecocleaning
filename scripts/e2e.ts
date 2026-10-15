/**
 * The L2 local stack and gate runner (PRD §16.3 → L2).
 *
 * One command brings up everything the Stripe gates need, in the order they need
 * it, and tears it down again:
 *
 *   1. `stripe listen` — forwards real Stripe test-mode events to the app's
 *      webhook and prints a signing secret for THIS session.
 *   2. `next dev` — started afterwards, with that secret in its environment.
 *      This ordering is the whole reason the runner exists: the signing secret
 *      does not exist until `stripe listen` has started, and a server started
 *      without it rejects every event with a 400, so captures and refunds never
 *      reconcile and the gates fail for a reason that has nothing to do with the
 *      code under test. `SETUP.md` §3.3 is explicit that the secret comes from
 *      the CLI per session and is never pasted into `.env.local`.
 *   3. `playwright test` — the gates themselves.
 *
 * It runs on a port of its own (3100) so it cannot collide with a `next dev` the
 * developer already has open on 3000, and it never touches any database but the
 * Neon `dev` branch — the guard runs first and refuses otherwise.
 *
 * Usage:  npm run test:e2e              (all gates)
 *         npm run test:e2e -- gate-d    (one spec, args pass through)
 */

import "./load-env";

import { spawn, type ChildProcess } from "node:child_process";

import { assertDevDatabase } from "./assert-dev-db";

/**
 * The events the app's webhook handles (`docs/DEPLOYMENT.md` §4b, and the
 * production endpoint must be subscribed to the same list).
 *
 * Named explicitly rather than forwarding everything: the Stripe CLI now
 * requires a list, and a list is better anyway — a gate that forwards every
 * event would pass while the production endpoint was subscribed to the wrong
 * ones, which is precisely the mismatch that silently breaks reconciliation.
 */
const WEBHOOK_EVENTS = [
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  // Card on file (SETUP D7 = A): how the saved card is recorded, server-side.
  "setup_intent.succeeded",
].join(",");

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
const WEBHOOK_PATH = "/api/stripe/webhook";

const children: ChildProcess[] = [];

function shutdown(): void {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

/** Start `stripe listen` and resolve once it has printed this session's secret. */
function startStripeListen(): Promise<{ secret: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "stripe",
      [
        "listen",
        "--api-key",
        process.env.STRIPE_SECRET_KEY!,
        "--forward-to",
        `localhost:${PORT}${WEBHOOK_PATH}`,
        "--events",
        WEBHOOK_EVENTS,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    children.push(child);

    let settled = false;
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      // The secret is printed once, on startup. Never logged here — it is a
      // signing key, and `CLAUDE.md` forbids printing key values.
      const match = text.match(/whsec_[A-Za-z0-9]+/);
      if (match && !settled) {
        settled = true;
        console.log("✓ stripe listen ready (webhook signing secret captured, not printed)");
        resolve({ secret: match[0] });
      }
      if (/error|Error/.test(text) && !settled) process.stderr.write(`[stripe listen] ${text}`);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `stripe listen exited (${code}) before printing a signing secret. Is the Stripe CLI ` +
              "installed (`brew install stripe/stripe-cli/stripe`) and is STRIPE_SECRET_KEY a test key?",
          ),
        );
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("stripe listen did not print a signing secret within 30s."));
      }
    }, 30_000);
  });
}

/** Start `next dev` on the gate port with the session's webhook secret. */
async function startApp(webhookSecret: string): Promise<void> {
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(PORT),
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      // Card on file (SETUP D7 = A) is off until its consent wording is approved
      // (Q-14). The gates have to exercise the mechanism, so the non-production
      // preview switch turns it on here — it cannot do so in production.
      CARD_ON_FILE_DEV_PREVIEW: "true",
      APP_ENV: "development",
    },
  });
  children.push(child);
  child.stdout?.on("data", (b: Buffer) => {
    const text = b.toString();
    if (/error|Error|warn/i.test(text)) process.stdout.write(`[next] ${text}`);
  });
  child.stderr?.on("data", (b: Buffer) => process.stderr.write(`[next] ${b}`));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) }).catch(
        () => fetch(BASE_URL, { signal: AbortSignal.timeout(2000) }),
      );
      if (res.ok || res.status < 500) {
        console.log(`✓ next dev ready on ${BASE_URL}`);
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next dev did not become ready on ${BASE_URL} within 90s.`);
}

function runPlaywright(extraArgs: string[], webhookSecret: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["playwright", "test", ...extraArgs], {
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: BASE_URL,
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        CARD_ON_FILE_DEV_PREVIEW: "true",
      },
    });
    children.push(child);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  assertDevDatabase();

  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not a test key. The gates create real charges against whatever " +
        "key is configured, so this refuses to run on anything but sk_test_ (CLAUDE.md).",
    );
  }

  const { secret } = await startStripeListen();
  await startApp(secret);
  const code = await runPlaywright(process.argv.slice(2), secret);
  shutdown();
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  shutdown();
  process.exit(1);
});
