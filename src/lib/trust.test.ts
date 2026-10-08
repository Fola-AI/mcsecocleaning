import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  confirmedTrustBadges,
  confirmedTrustLabels,
  vettingSentence,
  crewAssurancePhrase,
  damageHandlingSentence,
  commercialAssuranceLine,
  yearsTradingLabel,
  hasAnyVettingClaim,
  type TrustClaims,
} from "./trust";
import { site } from "@/config/site";

/**
 * Trust-claim gate (§8, §12.4). Two things are tested here:
 *
 *  1. The resolvers withhold every unconfirmed claim, in each combination.
 *  2. No claim string is hardcoded anywhere a customer can read it — the scan
 *     at the bottom. Without it the gate decays the first time someone types
 *     "DBS-checked" into a component, which is exactly how this started.
 */

/** Nothing confirmed — the shipping default. */
const none: TrustClaims = {
  publicLiability: { confirmed: false, cover: "£5m" },
  dbsChecked: { confirmed: false },
  insured: { confirmed: false },
  yearsTrading: { confirmed: false, years: null },
  reCleanGuarantee: { confirmed: true },
  ecoProducts: { confirmed: true },
  photoProof: { confirmed: true },
  publishedPrices: { confirmed: true },
};

const all: TrustClaims = {
  ...none,
  publicLiability: { confirmed: true, cover: "£5m" },
  dbsChecked: { confirmed: true },
  insured: { confirmed: true },
  yearsTrading: { confirmed: true, years: 3 },
};

describe("trust claims — withheld until confirmed", () => {
  test("the shipping config confirms no vetting claim", () => {
    // If this fails, someone flipped a claim without Fola's confirmation.
    assert.equal(hasAnyVettingClaim(site.trust), false);
    assert.equal(site.trust.publicLiability.confirmed, false);
    assert.equal(site.trust.dbsChecked.confirmed, false);
    assert.equal(site.trust.insured.confirmed, false);
  });

  test("badges omit insurance and DBS, keep our own process claims", () => {
    const labels = confirmedTrustLabels(none);
    assert.ok(!labels.some((l) => /public liability|insured|DBS/i.test(l)));
    assert.deepEqual(labels, [
      "Non-toxic eco products",
      "Before/after photos",
      "Re-clean guarantee",
      "Fixed prices online",
    ]);
  });

  test("badges include the cover figure once confirmed", () => {
    const labels = confirmedTrustLabels(all);
    assert.ok(labels.includes("£5m public liability"));
    assert.ok(labels.includes("DBS-checked crews"));
  });

  test('"fully insured" stands in when insured is confirmed but no cover figure is', () => {
    const labels = confirmedTrustLabels({ ...none, insured: { confirmed: true } });
    assert.ok(labels.includes("Fully insured"));
    // and never both forms of the same claim
    assert.ok(!labels.some((l) => l.includes("public liability")));
  });

  test("a confirmed cover figure wins over the generic claim", () => {
    const labels = confirmedTrustLabels(all);
    assert.ok(!labels.includes("Fully insured"));
    assert.equal(labels.filter((l) => /insur|liability/i.test(l)).length, 1);
  });

  test("badges carry an icon and are stable keys", () => {
    const badges = confirmedTrustBadges(none);
    assert.ok(badges.every((b) => b.icon.length > 0 && b.label.length > 0));
    assert.equal(new Set(badges.map((b) => b.label)).size, badges.length);
  });
});

describe("vettingSentence", () => {
  test("null when nothing is confirmed, so the caller drops the FAQ", () => {
    assert.equal(vettingSentence(none), null);
  });

  test("names both claims when both are confirmed", () => {
    assert.equal(
      vettingSentence(all),
      "Yes — £5m public liability cover and DBS-checked crews. We treat your home and your keys with the seriousness they deserve."
    );
  });

  test("names only DBS when only DBS is confirmed", () => {
    const s = vettingSentence({ ...none, dbsChecked: { confirmed: true } })!;
    assert.ok(s.includes("DBS-checked crews"));
    assert.ok(!/liability|insured/i.test(s));
  });

  test("names cover only when only cover is confirmed", () => {
    const s = vettingSentence({ ...none, publicLiability: { confirmed: true, cover: "£2m" } })!;
    assert.ok(s.includes("£2m public liability cover"));
    assert.ok(!s.includes("DBS"));
  });
});

describe("crewAssurancePhrase", () => {
  test("null when nothing is confirmed", () => {
    assert.equal(crewAssurancePhrase(none), null);
  });

  test("public liability alone implies insured", () => {
    assert.equal(
      crewAssurancePhrase({ ...none, publicLiability: { confirmed: true, cover: "£5m" } }),
      "insured"
    );
  });

  test("both claims read as a list", () => {
    assert.equal(crewAssurancePhrase(all), "insured, DBS-checked");
  });

  test("never claims insurance twice when both insured and cover are confirmed", () => {
    const p = crewAssurancePhrase(all)!;
    assert.equal(p.split("insured").length - 1, 1);
  });
});

describe("damageHandlingSentence", () => {
  test("describes the process without asserting cover when unconfirmed", () => {
    const s = damageHandlingSentence(none);
    assert.ok(!/insured/i.test(s));
    assert.ok(s.includes("photos"));
  });

  test("asserts cover once confirmed", () => {
    assert.ok(/fully insured/i.test(damageHandlingSentence(all)));
  });
});

describe("commercialAssuranceLine", () => {
  test("falls back to crew consistency, which is true either way", () => {
    const line = commercialAssuranceLine({ claims: none });
    assert.ok(!/insured|DBS/i.test(line));
    assert.ok(line.length > 0);
  });

  test("leads with the confirmed claims, capitalised", () => {
    const line = commercialAssuranceLine({ claims: all });
    assert.ok(line.startsWith("Insured, DBS-checked crews"));
  });

  test("a suffix stays grammatical on both branches", () => {
    const s = "and documented eco-friendly products";
    assert.ok(commercialAssuranceLine({ claims: none, suffix: s }).endsWith(s));
    assert.ok(commercialAssuranceLine({ claims: all, suffix: s }).endsWith(s));
  });
});

describe("yearsTradingLabel", () => {
  test("omitted unless confirmed with a number", () => {
    assert.equal(yearsTradingLabel(none), null);
    assert.equal(yearsTradingLabel({ ...none, yearsTrading: { confirmed: true, years: null } }), null);
  });

  test("singular and plural", () => {
    assert.equal(yearsTradingLabel({ ...none, yearsTrading: { confirmed: true, years: 1 } }), "1 year of trading");
    assert.equal(yearsTradingLabel(all), "3 years of trading");
  });
});

/**
 * Source scan — no claim string may be hardcoded in a rendered surface.
 *
 * `src/config/site.ts` holds the claims themselves and `src/lib/trust.ts` holds
 * the wording, so both are exempt. `src/app/terms/page.tsx` §7 is exempt for a
 * different reason: it is legal wording, and changing legal wording is a Park
 * item under `CLAUDE.md` → *Decision boundary*. It is raised as an open question
 * in `PROGRESS.md` (Q-8) rather than edited here.
 */
const CLAIM_PATTERNS = [
  /DBS[- ]checked/i,
  /fully insured/i,
  /£\s?\d+(\.\d+)?\s?m\s+public liability/i,
  /public liability/i,
  /eco-certified/i,
  /years trading/i,
];

const EXEMPT = new Set([
  join("src", "config", "site.ts"),
  join("src", "lib", "trust.ts"),
  join("src", "lib", "trust.test.ts"),
  join("src", "app", "terms", "page.tsx"), // legal wording — parked, see Q-8
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no trust claim is hardcoded in a rendered surface", () => {
  test("src/app, src/components and src/config are clean", () => {
    const files = [
      ...walk(join("src", "app")),
      ...walk(join("src", "components")),
      ...walk(join("src", "config")),
    ].filter((f) => !EXEMPT.has(f));

    const offences: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const pattern of CLAIM_PATTERNS) {
          if (pattern.test(line)) offences.push(`${file}:${i + 1} — ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(
      offences,
      [],
      `Trust claims must come from src/lib/trust.ts, not be written inline:\n${offences.join("\n")}`
    );
  });
});
