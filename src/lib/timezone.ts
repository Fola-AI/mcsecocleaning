/**
 * Timezone policy (§9.2): store UTC, render Europe/London, be explicit
 * everywhere. BST/GMT transitions are the single most common scheduling bug, so
 * all conversions go through these helpers.
 */

export const LONDON_TZ = "Europe/London";

/** Offset (ms) between the given zone and UTC at a specific instant. */
export function zoneOffsetMs(instant: Date, timeZone: string = LONDON_TZ): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl can emit hour "24" at midnight; normalise to 0.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - instant.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the correct UTC instant, handling
 * BST/GMT (and DST gaps/overlaps) by resolving the offset at the target instant.
 */
export function zonedWallTimeToUtc(
  y: number,
  m: number, // 1-12
  d: number,
  hh: number,
  mi: number,
  timeZone: string = LONDON_TZ
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mi, 0);
  const offset1 = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  // Re-resolve once in case the guess landed on the wrong side of a transition.
  const offset2 = zoneOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

/** Format an instant as YYYY-MM-DD in the given zone. */
export function localDateString(instant: Date, timeZone: string = LONDON_TZ): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instant); // en-CA gives YYYY-MM-DD
}

/** Format an instant as HH:mm in the given zone (24h). */
export function localTimeString(instant: Date, timeZone: string = LONDON_TZ): string {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return dtf.format(instant);
}
