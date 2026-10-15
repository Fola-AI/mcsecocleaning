/**
 * Crew PIN hashing and lockout rules (§9.2, PRD §16.3 → L5).
 *
 * ## Why a PIN at all
 *
 * §9.2: *"Design for a phone, often on mobile data, sometimes on a shared
 * device. Consider PIN login on a persistent session rather than repeated
 * password entry."* A crew member standing on a doorstep in the rain will not
 * type a password, and a magic link needs an inbox they may not have on that
 * device. So: a short PIN, a long-lived session, and a sign-out that genuinely
 * ends it.
 *
 * ## Why the lockout is not optional
 *
 * A four-digit PIN is ten thousand guesses — a few minutes of scripted attempts.
 * Without a lockout it is not a credential, it is a formality. So failures are
 * counted per identifier and the account locks for a cooling-off period that
 * grows with repeated lockouts.
 *
 * The hashing and the lockout arithmetic are pure and live here so both can be
 * tested without a database or a browser, and so the one place that decides
 * "is this PIN right" is a few lines long and readable.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Minimum length. Four digits is the floor the lockout makes defensible. */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 10;

/** Failures before the account locks. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long a lockout lasts, lengthening each time it happens. */
export const LOCKOUT_MINUTES = [5, 15, 60] as const;

/** scrypt parameters. N=16384 is ~100ms — slow enough to matter, fast enough on a phone. */
const SCRYPT_N = 16_384;
const KEY_LENGTH = 32;

export interface PinVerdict {
  ok: boolean;
  reason?: string;
}

/** Is this an acceptable PIN to set? */
export function checkPinStrength(pin: string): PinVerdict {
  if (!/^\d+$/.test(pin)) return { ok: false, reason: "A PIN is digits only." };
  if (pin.length < MIN_PIN_LENGTH) {
    return { ok: false, reason: `A PIN must be at least ${MIN_PIN_LENGTH} digits.` };
  }
  if (pin.length > MAX_PIN_LENGTH) {
    return { ok: false, reason: `A PIN can be at most ${MAX_PIN_LENGTH} digits.` };
  }
  // The handful that are guessed first. Refusing them costs a crew member one
  // retry; allowing them costs everyone the lockout's protection, because an
  // attacker tries these before anything else.
  if (/^(\d)\1+$/.test(pin)) return { ok: false, reason: "Not all the same digit — that is guessed first." };
  if (isSequential(pin)) return { ok: false, reason: "Not a run of consecutive digits." };
  if (["1234", "0000", "1111", "2580", "1212"].includes(pin)) {
    return { ok: false, reason: "That is one of the most common PINs — please choose another." };
  }
  return { ok: true };
}

function isSequential(pin: string): boolean {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) + 1) up = false;
    if (Number(pin[i]) !== Number(pin[i - 1]) - 1) down = false;
  }
  return up || down;
}

/**
 * Hash a PIN for storage, as `scrypt$<salt>$<key>`.
 *
 * A random per-PIN salt means two crew members with the same PIN do not share a
 * hash — otherwise the stored hashes themselves leak which accounts to try first.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pin, salt, KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Check a PIN against a stored hash.
 *
 * Compared with `timingSafeEqual`, so the time taken does not reveal how much of
 * the hash matched. Returns false for anything malformed rather than throwing: a
 * corrupt hash must read as "wrong PIN", never as an error that might be handled
 * differently somewhere up the stack — and never as a match, which is the real
 * danger and what the length checks below are for.
 */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    // Lengths are checked BEFORE comparing. A corrupt hash can decode to an
    // empty buffer, and `timingSafeEqual(empty, empty)` is true — so without
    // this, a blanked-out hash column would authenticate every PIN, including
    // an empty one. The test for it is in crew-pin.test.ts.
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(pin, salt, expected.length, { N: SCRYPT_N });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface AttemptRecord {
  failedCount: number;
  lockedUntil: Date | null;
}

export interface LockoutState {
  locked: boolean;
  /** Seconds until the account unlocks. */
  secondsRemaining: number;
  message?: string;
}

/** Is this identifier locked right now? */
export function lockoutState(attempt: AttemptRecord | null, now: Date = new Date()): LockoutState {
  if (!attempt?.lockedUntil || attempt.lockedUntil <= now) {
    return { locked: false, secondsRemaining: 0 };
  }
  const secondsRemaining = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000);
  const minutes = Math.ceil(secondsRemaining / 60);
  return {
    locked: true,
    secondsRemaining,
    message: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask the office to reset it.`,
  };
}

/**
 * The attempt record after a failure.
 *
 * The lockout lengthens each time it is hit — 5 minutes, then 15, then an hour —
 * so a one-off fat-fingered PIN costs almost nothing while a scripted attack
 * gets slower the longer it runs. The counter resets on a successful sign-in,
 * not on time, so attempts spread out over a day still add up.
 */
export function nextAttemptState(
  attempt: AttemptRecord | null,
  now: Date = new Date(),
): { failedCount: number; lockedUntil: Date | null } {
  const failedCount = (attempt?.failedCount ?? 0) + 1;
  if (failedCount < MAX_FAILED_ATTEMPTS) return { failedCount, lockedUntil: null };

  // Which lockout this is: the 5th failure is the first, the 10th the second.
  const lockoutIndex = Math.min(
    Math.floor(failedCount / MAX_FAILED_ATTEMPTS) - 1,
    LOCKOUT_MINUTES.length - 1,
  );
  const minutes = LOCKOUT_MINUTES[lockoutIndex];
  return { failedCount, lockedUntil: new Date(now.getTime() + minutes * 60_000) };
}

/** How an identifier is stored and compared: trimmed, lower-cased, spaces out of phones. */
export function normaliseIdentifier(identifier: string): string {
  const trimmed = identifier.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : trimmed.replace(/[\s()-]/g, "");
}
