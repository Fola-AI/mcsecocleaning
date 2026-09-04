/**
 * Security config for property access codes (§6.9).
 *
 * Access codes (lockbox / alarm) are visible ONLY to the assigned crew, and only
 * within a window around the scheduled job. Every access is logged. Treat these
 * with the same seriousness as payment data — a leaked alarm code is a burglary.
 */
export const accessCodeConfig = {
  /** Hours before scheduled start the assigned crew may reveal codes. */
  windowBeforeHours: 2,
  /** Hours after scheduled start (roughly job length + buffer) codes stay visible. */
  windowAfterHours: 4,
} as const;
