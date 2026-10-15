/**
 * Service-area validation (§6.4, booking step 0 §6.1).
 * UK local search + operations run at postcode-district level.
 */
import { areas } from "@/config/areas";

/** UK postcode outward-code (district), e.g. "SW4", "M20", "EC1A". */
export function outwardCode(postcode: string): string | null {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, "");
  // Basic UK postcode shape: outward (2–4) + inward (digit+2 letters).
  const m = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (m) return m[1];
  // Allow a bare outward code (e.g. user types just "SW4").
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(cleaned)) return cleaned;
  return null;
}

export interface AreaCheckResult {
  valid: boolean; // is it a well-formed postcode/outward code
  inArea: boolean;
  outward: string | null;
  areaSlug?: string;
  areaName?: string;
  /** The §4 patch the area belongs to — capacity's Bromley rule keys off it. */
  patchGroup?: "core" | "bromley" | "phase_two_west";
}

/** All served outward codes, from active areas. */
export function servedDistricts(): string[] {
  return areas
    .filter((a) => a.active)
    .flatMap((a) => a.postcodeDistricts.map((d) => d.toUpperCase()));
}

export function checkServiceArea(postcode: string): AreaCheckResult {
  const outward = outwardCode(postcode);
  if (!outward) return { valid: false, inArea: false, outward: null };
  const match = areas.find(
    (a) => a.active && a.postcodeDistricts.some((d) => d.toUpperCase() === outward)
  );
  return {
    valid: true,
    inArea: Boolean(match),
    outward,
    areaSlug: match?.slug,
    areaName: match?.name,
    patchGroup: match?.patchGroup,
  };
}

/**
 * The §4 patch a postcode belongs to, or null if we do not cover it.
 *
 * Capacity needs this (§7.5): a crew's day never spans two patches, and Bromley
 * is a separate patch for that arithmetic reason rather than an administrative
 * one.
 */
export function patchGroupFor(postcode: string): string | null {
  return checkServiceArea(postcode).patchGroup ?? null;
}
