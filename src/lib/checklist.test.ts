import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { canCompleteItem, groupItems, progressOf, snapshotItems } from "./checklist";
import { serviceTemplates, templateForService } from "@/config/checklists";

/**
 * §9.6 calls a completed end-of-tenancy checklist "your evidence in a deposit
 * dispute". Two things follow, and both are tested here: the checklist is a
 * snapshot of what was agreed on the day, and an item whose point is a
 * photograph cannot be ticked without one.
 */

describe("snapshotItems", () => {
  const template = templateForService("end-of-tenancy-cleaning")!;
  const snapshot = snapshotItems(template.items);

  test("every template item becomes a job item", () => {
    assert.equal(snapshot.length, template.items.length);
    assert.ok(snapshot.length > 15, "the EOT checklist is substantial by design");
  });

  test("the photo rule travels with the item", () => {
    // Stored on the item, not looked up later: the template will be edited, and
    // the rule that applied on the day is the one that counts in a dispute.
    const oven = snapshot.find((item) => item.label.includes("Oven interior"));
    assert.ok(oven);
    assert.equal(oven!.requiresPhoto, true);
  });

  test("the room and the order come across, so the list reads as the work happens", () => {
    const kitchen = snapshot.filter((item) => item.groupLabel === "Kitchen");
    assert.ok(kitchen.length >= 5);
    assert.deepEqual(
      [...kitchen].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.sortOrder),
      kitchen.map((i) => i.sortOrder),
      "kitchen items are already in order",
    );
  });

  test("the reference survives a template being reordered", () => {
    const first = snapshot[0];
    const reordered = snapshotItems([...template.items].reverse());
    const same = reordered.find((item) => item.templateItemRef === first.templateItemRef);
    assert.ok(same, "an item can still be traced to what it came from");
    assert.equal(same!.label, first.label);
  });

  test("the end-of-tenancy template mirrors what an inventory clerk checks (§9.6)", () => {
    // Named explicitly because this is the one template with a legal purpose —
    // if someone trims it for being long, this fails and says why.
    const labels = snapshot.map((item) => item.label.toLowerCase()).join(" | ");
    for (const required of [
      "oven interior",
      "cupboards",
      "limescale",
      "skirting",
      "interior windows",
      "extractor fan",
    ]) {
      assert.match(labels, new RegExp(required), `the EOT checklist must cover ${required}`);
    }
  });
});

describe("canCompleteItem", () => {
  const plain = { completed: false, requiresPhoto: false, mediaId: null };
  const needsPhoto = { completed: false, requiresPhoto: true, mediaId: null };

  test("an ordinary item just ticks", () => {
    assert.equal(canCompleteItem(plain).ok, true);
  });

  test("a photo-required item cannot be ticked without media", () => {
    // The stage's acceptance criterion. An oven ticked clean with no photograph
    // is worth nothing in the dispute the checklist exists for.
    const verdict = canCompleteItem(needsPhoto);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /Take a photo/);
  });

  test("with a photo attached it ticks", () => {
    assert.equal(canCompleteItem({ ...needsPhoto, mediaId: "media_1" }).ok, true);
  });

  test("while media is unavailable the refusal says so, and does not blame the crew", () => {
    const verdict = canCompleteItem(needsPhoto, { mediaAvailable: false });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /isn't switched on yet/);
    assert.match(verdict.reason!, /tell the office/);
  });

  test("media being unavailable does not block an item that needs no photo", () => {
    assert.equal(canCompleteItem(plain, { mediaAvailable: false }).ok, true);
  });
});

describe("progressOf", () => {
  const items = [
    { completed: true, requiresPhoto: false, mediaId: null },
    { completed: false, requiresPhoto: false, mediaId: null },
    { completed: false, requiresPhoto: true, mediaId: null },
  ];

  test("counts what is done and what is held", () => {
    const progress = progressOf(items, { mediaAvailable: false });
    assert.equal(progress.total, 3);
    assert.equal(progress.completed, 1);
    assert.equal(progress.blocked, 1, "the photo-required item is held, not merely outstanding");
    assert.equal(progress.finished, false);
  });

  test("finished means everything that could be done is done", () => {
    const done = items.map((item) => ({ ...item, completed: true }));
    assert.equal(progressOf(done).finished, true);
  });

  test("a job with no checklist is not 'finished'", () => {
    // Otherwise an empty checklist would read as a completed one.
    assert.equal(progressOf([]).finished, false);
  });
});

describe("groupItems", () => {
  test("groups in template order, items sorted within each", () => {
    const grouped = groupItems([
      { groupLabel: "Bathrooms", sortOrder: 7 },
      { groupLabel: "Kitchen", sortOrder: 2 },
      { groupLabel: "Kitchen", sortOrder: 1 },
    ]);
    assert.deepEqual(grouped.map((g) => g.group), ["Kitchen", "Bathrooms"]);
    assert.deepEqual(grouped[0].items.map((i) => i.sortOrder), [1, 2]);
  });

  test("an ungrouped item lands in General rather than disappearing", () => {
    const grouped = groupItems([{ groupLabel: null, sortOrder: 1 }]);
    assert.deepEqual(grouped.map((g) => g.group), ["General"]);
  });
});

describe("every seeded template", () => {
  test("has items, and at least one photo-required item where it matters", () => {
    for (const template of serviceTemplates) {
      const snapshot = snapshotItems(template.items);
      assert.ok(snapshot.length > 0, `${template.serviceSlug} has no items`);
      assert.ok(
        snapshot.every((item) => item.label.trim().length > 0),
        `${template.serviceSlug} has a blank label`,
      );
    }
    // The two that end in a dispute or a deposit must demand evidence.
    for (const slug of ["end-of-tenancy-cleaning", "deep-cleaning"]) {
      const snapshot = snapshotItems(templateForService(slug)!.items);
      assert.ok(
        snapshot.some((item) => item.requiresPhoto),
        `${slug} should require photo evidence somewhere`,
      );
    }
  });
});
