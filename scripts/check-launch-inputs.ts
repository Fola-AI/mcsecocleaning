/**
 * Launch-inputs check (PRD §16.3 L1, gate at L15).
 *
 * Lists every value in `src/` that only Fola can supply: `PLACEHOLDER`s and the
 * `TODO(business-input)` / `TODO(pricing)` / `TODO(legal)` / `TODO(ops)`
 * markers. Exits non-zero while any remain.
 *
 * Deliberately NOT wired into `npm run build`: these markers are expected to be
 * present for most of the build, and a build that fails on them would block
 * every stage. It is the L15 release gate, and a progress report in the
 * meantime — `npm run check:launch-inputs`.
 *
 * Note it reports unconfirmed **trust claims** separately. Those are not marked
 * `PLACEHOLDER` (they are booleans), but a launch with "DBS-checked" withheld is
 * a decision Fola should take knowingly rather than discover.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { site } from "../src/config/site";

const ROOT = "src";

const MARKERS = [
  { label: "TODO(business-input)", pattern: /TODO\(business-input\)/ },
  { label: "TODO(pricing)", pattern: /TODO\(pricing\)/ },
  { label: "TODO(legal)", pattern: /TODO\(legal\)/ },
  { label: "TODO(ops)", pattern: /TODO\(ops\)/ },
  { label: "PLACEHOLDER", pattern: /PLACEHOLDER/ },
] as const;

interface Finding {
  label: string;
  file: string;
  line: number;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function findMarkers(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(ROOT)) {
    // The check's own scanners name the markers; skip them.
    if (/check-launch-inputs\.ts$|trust\.test\.ts$/.test(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const { label, pattern } of MARKERS) {
        if (pattern.test(line)) {
          findings.push({
            label,
            file: relative(".", file),
            line: i + 1,
            text: line.trim().slice(0, 110),
          });
        }
      }
    });
  }
  return findings;
}

function unconfirmedTrustClaims(): string[] {
  const t = site.trust;
  const unconfirmed: string[] = [];
  if (!t.publicLiability.confirmed) unconfirmed.push("publicLiability (cover figure + insurer)");
  if (!t.dbsChecked.confirmed) unconfirmed.push("dbsChecked");
  if (!t.insured.confirmed) unconfirmed.push('insured ("fully insured")');
  if (!t.yearsTrading.confirmed) unconfirmed.push("yearsTrading");
  return unconfirmed;
}

const findings = findMarkers();
const claims = unconfirmedTrustClaims();

const byLabel = new Map<string, Finding[]>();
for (const f of findings) {
  const list = byLabel.get(f.label) ?? [];
  list.push(f);
  byLabel.set(f.label, list);
}

console.log("\nLaunch inputs still required from Fola\n" + "=".repeat(38));

if (findings.length === 0) {
  console.log("\n✓ No PLACEHOLDER or TODO(...) markers left in src/.");
} else {
  for (const { label } of MARKERS) {
    const list = byLabel.get(label);
    if (!list?.length) continue;
    console.log(`\n${label} — ${list.length}`);
    // Group by file so the output is a worklist, not a wall.
    const files = new Map<string, Finding[]>();
    for (const f of list) files.set(f.file, [...(files.get(f.file) ?? []), f]);
    for (const [file, fs] of files) {
      console.log(`  ${file} (${fs.length})`);
      for (const f of fs.slice(0, 4)) console.log(`    ${f.line}: ${f.text}`);
      if (fs.length > 4) console.log(`    … ${fs.length - 4} more`);
    }
  }
}

if (claims.length > 0) {
  console.log(`\nUnconfirmed trust claims — ${claims.length} (withheld from the site, not blocking)`);
  for (const c of claims) console.log(`  ${c}`);
  console.log("  Confirm in src/config/site.ts → trust, then these render (PROGRESS.md Q-3).");
}

const total = findings.length;
console.log(
  `\n${total === 0 ? "✓" : "✗"} ${total} marker${total === 1 ? "" : "s"} outstanding` +
    `${claims.length ? `, ${claims.length} trust claim${claims.length === 1 ? "" : "s"} unconfirmed` : ""}.\n`
);

process.exit(total === 0 ? 0 : 1);
