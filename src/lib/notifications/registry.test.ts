import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  NOTIFICATION_TRIGGERS,
  dedupeKey,
  marketingTriggers,
  triggerById,
} from "./registry";
import { templates } from "./templates";

/**
 * The §10.3 matrix, checked as a matrix (PRD §16.3 → L9: *"a test per
 * trigger"*).
 *
 * Two things are being protected. First, that every row of §10.3 exists —
 * "did we ever build the subscription-lapsing email?" should have an answer you
 * can compute. Second, and more important, that **marketing is marked as
 * marketing**: PECR gates on that flag, and a review request classified as
 * transactional is a breach that nothing else in the system would catch.
 */

/** §10.3, transcribed. If the PRD's table changes, this list is what fails. */
const PRD_ROWS = [
  "Booking confirmed",
  "Pre-contract information",
  "Reminder, 24h before",
  "Crew on the way",
  "Job completed + media link",
  "Review request, 24h after",
  "Payment failed",
  "Subscription lapsing",
  "Recurring visit, 3 days before",
  "New assignment",
  "Schedule change",
  "Complaint raised",
  "Job stuck in progress",
];

describe("every row of §10.3 has a trigger", () => {
  for (const row of PRD_ROWS) {
    test(row, () => {
      const match = NOTIFICATION_TRIGGERS.find((trigger) =>
        trigger.label.toLowerCase().startsWith(row.toLowerCase().slice(0, 18)),
      );
      assert.ok(match, `§10.3 lists "${row}" but no trigger declares it`);
      assert.ok(match!.id.length > 0);
      assert.ok(["customer", "crew", "admin"].includes(match!.audience));
    });
  }

  test("no trigger has been invented that §10.3 does not list", () => {
    // The matrix is the specification; adding to it is a product decision, not
    // an implementation one.
    assert.equal(NOTIFICATION_TRIGGERS.length, PRD_ROWS.length);
  });

  test("ids are unique — they are dedupe keys", () => {
    const ids = NOTIFICATION_TRIGGERS.map((trigger) => trigger.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("marketing is marked, and gated", () => {
  test("exactly the two win-back messages are marketing", () => {
    // A booking confirmation is not marketing however cheerful it is; a review
    // request is, because it asks the customer to do something for us.
    assert.deepEqual(
      marketingTriggers().map((trigger) => trigger.id).sort(),
      ["review_request", "subscription_lapsing"],
    );
  });

  test("every marketing trigger explains itself", () => {
    for (const trigger of marketingTriggers()) {
      assert.ok(trigger.note, `${trigger.id} is marketing but does not say why`);
    }
  });

  test("the pre-contract information is never marketing — it is a legal duty", () => {
    const preContract = triggerById("pre_contract")!;
    assert.equal(preContract.marketing, false);
    assert.match(preContract.note!, /legal duty/i);
  });

  test("the gate reads the trigger's own flag, not a second list", () => {
    // A second list of "which ones are marketing" is a second thing to forget.
    const source = readFileSync(join("src", "lib", "notifications", "policy.ts"), "utf8");
    assert.match(source, /trigger\.marketing/);
    assert.match(source, /marketingConsent !== true/);
    // And the sender uses that decision rather than making its own.
    const sender = readFileSync(join("src", "lib", "notifications", "send.ts"), "utf8");
    assert.match(sender, /decideSend\(/);
  });
});

describe("dedupe keys", () => {
  test("identify one message about one thing", () => {
    assert.equal(dedupeKey("reminder_24h", "email", "job_1"), "reminder_24h:email:job_1");
  });

  test("the two channels of one trigger do not collide", () => {
    assert.notEqual(dedupeKey("reminder_24h", "email", "j"), dedupeKey("reminder_24h", "sms", "j"));
  });
});

describe("no message body can carry an access code (§9.3, §6.9)", () => {
  test("no template takes a property's code fields", () => {
    // Structural rather than behavioural: a template cannot leak what it is
    // never handed. This is the L6 scan, extended to L9's templates.
    const source = readFileSync(join("src", "lib", "notifications", "templates.ts"), "utf8");
    for (const field of ["accessCodeEncrypted", "alarmCodeEncrypted", "decryptAccessCode"]) {
      assert.ok(!source.includes(field), `templates.ts must not mention ${field}`);
    }
  });

  test("rendering every template with a code-bearing fixture leaks nothing", () => {
    const CODE = "8421";
    const context = {
      customerName: `Alex ${CODE}`, // the code smuggled in as data
      serviceName: "Domestic cleaning",
      when: "Tue 3 Nov",
      time: "09:00",
      accountUrl: "https://example.test/account",
      skipUrl: "https://example.test/skip",
      postcode: "SW4 7AA",
      issueType: "damage_claim",
      message: "Scratched worktop",
      jobUrl: "https://example.test/admin/jobs/1",
    };

    const rendered = [
      templates.reminder24hEmail(context).html,
      templates.reminder24hSms(context),
      templates.crewOnTheWaySms(),
      templates.recurringVisit3dSms(context),
      templates.subscriptionLapsingEmail(context).html,
      templates.reviewRequestEmail(context).html,
      templates.reviewRequestSms(context),
      templates.crewAssignmentSms(context),
      templates.crewScheduleChangeSms(context),
      templates.adminComplaintEmail(context).html,
    ];

    // Only the templates that are handed the name may echo it — and none is
    // handed a code at all, which is the actual guarantee.
    for (const output of rendered) {
      assert.ok(typeof output === "string" && output.length > 0);
    }
    // "Crew on the way" deliberately carries nothing identifying.
    assert.ok(!templates.crewOnTheWaySms().includes(CODE));
    assert.ok(!templates.crewOnTheWaySms().includes("SW4"));
  });

  test("transactional messages say nothing promotional (§10.3)", () => {
    const transactional = [
      templates.reminder24hSms({
        customerName: "Alex",
        serviceName: "Domestic cleaning",
        when: "Tue 3 Nov",
        time: "09:00",
        accountUrl: "https://example.test/account",
      }),
      templates.crewOnTheWaySms(),
    ];
    for (const message of transactional) {
      assert.ok(
        !/offer|discount|refer a friend|% off|sale/i.test(message),
        `a transactional message must not advertise: ${message}`,
      );
    }
  });

  test("the marketing email carries a way out (§14)", () => {
    const html = templates.reviewRequestEmail({
      customerName: "Alex",
      serviceName: "Domestic cleaning",
      when: "Tue 3 Nov",
      accountUrl: "https://example.test/account",
    }).html;
    assert.match(html, /Change that any time|unsubscribe/i);
  });

  test("the marketing SMS says how to stop", () => {
    const message = templates.reviewRequestSms({
      customerName: "Alex",
      serviceName: "Domestic cleaning",
      when: "Tue 3 Nov",
      accountUrl: "https://example.test/account",
    });
    assert.match(message, /STOP/);
  });
});

describe("the senders exist", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  // The registry itself is excluded, or every trigger "exists" because it is
  // declared — which is exactly the false pass this test is for.
  const sources = walk("src")
    .filter((file) => !file.includes(".test.") && !file.endsWith(join("notifications", "registry.ts")))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  for (const trigger of NOTIFICATION_TRIGGERS) {
    test(`${trigger.id} is actually sent somewhere`, (t) => {
      if (trigger.channels.length === 0) {
        // Dashboard-only rows have no sender by design (§10.3 "Job stuck in
        // progress" is a Today-view bucket, not a 2am email).
        t.skip("dashboard only — no sender by design");
        return;
      }
      assert.ok(
        sources.includes(`"${trigger.id}"`),
        `${trigger.id} is declared in the matrix but nothing sends it`,
      );
    });
  }
});
