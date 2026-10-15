import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every server action authorises itself (`CLAUDE.md` → *Security rules*; PRD
 * §16.1 gap 3).
 *
 * Why a source scan rather than a review habit: in the App Router EVERY export
 * of a `"use server"` module is a callable server action. Next.js assigns it an
 * id and a client can invoke it with any argument it likes — so an export that
 * takes a job id and trusts the caller is reachable by anyone who can reach the
 * app. That is exactly how `prepareOutstandingCheckoutForVerifiedJob` came to
 * hand out a Stripe Checkout URL plus a customer's name and email for any job
 * id: its NAME said the caller had verified ownership, and nothing enforced it.
 *
 * The fix was to move that core to `src/lib/outstanding.ts` with
 * `import "server-only"`. This test is what stops the next one appearing: it
 * fails unless every export of every `src/app/actions/*.ts` module either makes
 * an authorisation decision or is on the deliberate public allow-list below.
 *
 * It is a lexical scan, so it proves an auth call is PRESENT, not that it is
 * correct or unconditional. That is the right trade: the failure it catches is
 * "nobody thought about auth here", which is the one that keeps happening.
 */

const ACTIONS_DIR = "src/app/actions";

/**
 * Actions a member of the public must be able to call, with the reason each one
 * is safe without a session. Anything not listed here needs an auth call.
 */
const PUBLIC_ALLOW_LIST: Record<string, string> = {
  getSlots:
    "reads availability for the booking wizard; no customer data in or out, and the " +
    "caller supplies only a duration",
  createBooking:
    "the booking wizard itself — the customer does not exist yet, so there is no " +
    "session to require; it validates its own input and prices from the rate card",
  submitLead:
    "the contact / quote-request form, same reason: a lead is created by someone who " +
    "has no account",
  crewSignIn:
    "the crew sign-in itself — it cannot require a session to create one. It is " +
    "protected instead by a hashed PIN, a per-identifier lockout, and a failure " +
    "message that does not say which half was wrong",
  crewSignInForm:
    "the same sign-in as a form action, so the crew app works before JavaScript " +
    "hydrates; it does nothing but call crewSignIn, which carries the protection",
  crewSignOut:
    "signing out must work whatever state the session is in, including already " +
    "expired; requiring a valid session to end one would strand a shared device " +
    "on the last person's day",
  acceptProposal:
    "a commercial customer accepting a proposal has no account — a managing agent " +
    "clicks the link they were sent, so the proposal id IS the credential. It " +
    "accepts only a proposal already marked sent, only once, and touches nothing " +
    "the holder of that link was not already given",
};

/**
 * The calls that count as an authorisation decision.
 *
 * Adding to this list is deliberate: a new guard has to be reviewed once, here,
 * rather than every action that uses it being waved through. `requireCrew` was
 * added in L5 and scopes to the signed-in crew member, whose own queries then
 * filter by that id.
 */
const AUTH_CALLS = ["requireRole(", "requireCustomer(", "requireCrew("] as const;

interface ActionExport {
  file: string;
  name: string;
  body: string;
}

/**
 * Pull each exported async function and the source from its signature to the
 * start of the next top-level export (or end of file) — its body, plus any
 * helper it is followed by, which is a deliberately generous window: a false
 * pass needs someone to have written an auth call nearby, a false failure would
 * need an action whose auth is further away than the next export.
 */
function exportedActions(file: string): ActionExport[] {
  const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
  assert.match(
    source,
    /^"use server";/m,
    `${file} is in src/app/actions but is not a "use server" module — either make it ` +
      "one or move it to src/lib, so there is no doubt whether its exports are callable",
  );

  const signature = /^export async function (\w+)/gm;
  const found: { name: string; index: number }[] = [];
  for (const match of source.matchAll(signature)) {
    found.push({ name: match[1], index: match.index });
  }

  // A non-async export of a "use server" module is a build error in Next, but
  // assert it rather than assume it — the rule is in CLAUDE.md for a reason.
  const nonAsync = [...source.matchAll(/^export (?!async function|type|interface)(\w+)/gm)];
  assert.equal(
    nonAsync.length,
    0,
    `${file} has a non-async export (${nonAsync.map((m) => m[0]).join(", ")}). A ` +
      '"use server" file may only export async functions — helpers belong in src/lib.',
  );

  return found.map((fn, i) => ({
    file,
    name: fn.name,
    body: source.slice(fn.index, found[i + 1]?.index ?? source.length),
  }));
}

const actionFiles = readdirSync(ACTIONS_DIR).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);
const allActions = actionFiles.flatMap(exportedActions);

describe("every server action authorises itself", () => {
  test("the scan found the action modules and their exports", () => {
    // If a refactor empties this, the test below passes vacuously.
    assert.ok(actionFiles.length >= 5, `expected the five action modules, found ${actionFiles}`);
    assert.ok(allActions.length >= 15, `expected ~16 actions, found ${allActions.length}`);
  });

  for (const action of allActions) {
    test(`${action.file} → ${action.name}`, () => {
      const allowed = Object.hasOwn(PUBLIC_ALLOW_LIST, action.name);
      const authorises = AUTH_CALLS.some((call) => action.body.includes(call));

      if (allowed) {
        assert.ok(
          !authorises,
          `${action.name} is on the public allow-list but calls an auth guard. One of the ` +
            "two is wrong: take it off the list, or drop the guard.",
        );
        return;
      }

      assert.ok(
        authorises,
        `${action.name} is an export of a "use server" module, so the client can call it ` +
          `with any argument. It calls neither ${AUTH_CALLS.join(" nor ")}. Add the guard, ` +
          "move the function to src/lib with `import \"server-only\"` if it is only ever a " +
          "helper, or add it to PUBLIC_ALLOW_LIST with the reason it is safe.",
      );
    });
  }

  test("the allow-list has no entries for actions that no longer exist", () => {
    const names = new Set(allActions.map((a) => a.name));
    const stale = Object.keys(PUBLIC_ALLOW_LIST).filter((name) => !names.has(name));
    assert.deepEqual(
      stale,
      [],
      `the allow-list exempts ${stale.join(", ")}, which no longer exists — a stale ` +
        "exemption is how a future action gets waved through by name",
    );
  });

  test("the retired unauthenticated export has not come back", () => {
    // The specific defect from the 9 Oct review (PRD §16.1 gap 3). Named so a
    // revert is caught by name and not only by the general rule above.
    for (const file of actionFiles) {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      assert.doesNotMatch(
        source,
        /export async function prepareOutstandingCheckout/,
        `${file} re-exports the outstanding-checkout core as a server action. It belongs ` +
          "in src/lib/outstanding.ts behind payMyOutstanding / rechargeOutstanding.",
      );
    }
  });
});
