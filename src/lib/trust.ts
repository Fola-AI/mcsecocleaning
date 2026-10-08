/**
 * Trust-claim resolution (§8, §12.4).
 *
 * The site makes four factual assertions about the business — public liability
 * cover, DBS checks, "fully insured", years trading — that only Fola can
 * confirm. Until he does, they must not appear anywhere a customer can read
 * them. Before this module they were hardcoded as plain strings in seven files,
 * which meant the site asserted all of them on the strength of an unconfirmed
 * config value.
 *
 * The rule, from `CLAUDE.md` → *Content and compliance rules*: a claim renders
 * only when `src/config/site.ts` marks it confirmed. Withheld, not softened —
 * there is no honest weaker form of "our crews are DBS-checked".
 *
 * Every consumer-facing surface composes its copy from the helpers here, so the
 * claim and the wording live in one place. `trust.test.ts` enforces that by
 * scanning the app and component trees for the raw claim strings.
 */
import { site } from "@/config/site";

/** A claim that is either confirmed by Fola or withheld. */
export interface ClaimFlag {
  readonly confirmed: boolean;
}

export interface TrustClaims {
  readonly publicLiability: ClaimFlag & { readonly cover: string };
  readonly dbsChecked: ClaimFlag;
  readonly insured: ClaimFlag;
  readonly yearsTrading: ClaimFlag & { readonly years: number | null };
  readonly reCleanGuarantee: ClaimFlag;
  readonly ecoProducts: ClaimFlag;
  readonly photoProof: ClaimFlag;
  readonly publishedPrices: ClaimFlag;
}

export interface TrustBadge {
  readonly icon: string;
  readonly label: string;
}

/**
 * The trust bar and hero badge strip (§12.1.4). Confirmed claims first, then
 * the ones that are our own process — so the row never looks padded when the
 * insurance claims are withheld (§12.4 warns against inventing filler).
 */
export function confirmedTrustBadges(t: TrustClaims = site.trust): TrustBadge[] {
  const badges: TrustBadge[] = [];
  if (t.publicLiability.confirmed) {
    badges.push({ icon: "🛡️", label: `${t.publicLiability.cover} public liability` });
  } else if (t.insured.confirmed) {
    // No cover figure to quote, but the umbrella claim is confirmed.
    badges.push({ icon: "🛡️", label: "Fully insured" });
  }
  if (t.dbsChecked.confirmed) badges.push({ icon: "✅", label: "DBS-checked crews" });
  if (t.ecoProducts.confirmed) badges.push({ icon: "♻️", label: "Non-toxic eco products" });
  if (t.photoProof.confirmed) badges.push({ icon: "📸", label: "Before/after photos" });
  if (t.reCleanGuarantee.confirmed) badges.push({ icon: "↩️", label: "Re-clean guarantee" });
  if (t.publishedPrices.confirmed) badges.push({ icon: "£", label: "Fixed prices online" });
  return badges;
}

/** Plain labels for the hero strip, which renders text without icons. */
export function confirmedTrustLabels(t: TrustClaims = site.trust): string[] {
  return confirmedTrustBadges(t).map((b) => b.label);
}

/**
 * A full sentence answering "are you insured and vetted?", or `null` when
 * neither claim is confirmed — in which case the caller drops the whole FAQ
 * entry or card rather than printing a hollow answer.
 */
export function vettingSentence(t: TrustClaims = site.trust): string | null {
  const parts: string[] = [];
  if (t.publicLiability.confirmed) parts.push(`${t.publicLiability.cover} public liability cover`);
  else if (t.insured.confirmed) parts.push("full public liability cover");
  if (t.dbsChecked.confirmed) parts.push("DBS-checked crews");
  if (parts.length === 0) return null;
  return `Yes — ${parts.join(" and ")}. We treat your home and your keys with the seriousness they deserve.`;
}

/**
 * An adjective phrase for inline use ("an insured, DBS-checked crew arrives"),
 * or `null` when nothing is confirmed, so the caller says "our crew" instead.
 */
export function crewAssurancePhrase(t: TrustClaims = site.trust): string | null {
  const parts: string[] = [];
  if (t.insured.confirmed || t.publicLiability.confirmed) parts.push("insured");
  if (t.dbsChecked.confirmed) parts.push("DBS-checked");
  return parts.length ? parts.join(", ") : null;
}

/**
 * How a damage report gets handled. The honest unconfirmed form describes the
 * process without asserting cover — the process is true either way.
 */
export function damageHandlingSentence(t: TrustClaims = site.trust): string {
  const insured = t.insured.confirmed || t.publicLiability.confirmed;
  return insured
    ? "Damage is handled separately from a cleaning complaint. Tell us as soon as you can with photos; we're fully insured and will guide you through it properly."
    : "Damage is handled separately from a cleaning complaint. Tell us as soon as you can with photos and we'll guide you through it properly.";
}

/**
 * A commercial "what you get" line (§7.6). Buyers ask about insurance and
 * vetting explicitly, so when nothing is confirmed we describe what is true
 * regardless — crew consistency — rather than dropping the bullet.
 *
 * `suffix` appends scope wording that belongs to the same bullet, so the
 * sentence stays grammatical whichever branch is taken.
 */
export function commercialAssuranceLine(
  opts: { suffix?: string; claims?: TrustClaims } = {}
): string {
  const { suffix, claims: t = site.trust } = opts;
  const phrase = crewAssurancePhrase(t);
  const head = phrase
    ? `${phrase[0].toUpperCase()}${phrase.slice(1)} crews with consistent assignment`
    : "Consistent crew assignment — the same people on your site each visit";
  return suffix ? `${head} ${suffix}` : head;
}

/** Years-trading claim for copy, or `null` to leave it out (§14.3). */
export function yearsTradingLabel(t: TrustClaims = site.trust): string | null {
  if (!t.yearsTrading.confirmed || t.yearsTrading.years === null) return null;
  const y = t.yearsTrading.years;
  return y === 1 ? "1 year of trading" : `${y} years of trading`;
}

/**
 * True when at least one of the four Fola-confirmed claims is live. Used by
 * surfaces that exist only to carry them (the About "Insured & vetted" card).
 */
export function hasAnyVettingClaim(t: TrustClaims = site.trust): boolean {
  return (
    t.publicLiability.confirmed ||
    t.insured.confirmed ||
    t.dbsChecked.confirmed ||
    t.yearsTrading.confirmed
  );
}
