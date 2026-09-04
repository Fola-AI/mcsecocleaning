import crypto from "node:crypto";
import { accessCodeConfig } from "@/config/security";

/**
 * Property access-code security (§6.9). Lockbox/alarm codes are:
 *  - Encrypted at rest with AES-256-GCM (authenticated — tampering is detected).
 *  - Revealed only to the ASSIGNED crew and only within a time window around the
 *    scheduled job.
 *  - Every reveal is logged (see recordAccessCodeView, DB-backed).
 *
 * The key comes from ACCESS_CODE_ENC_KEY (32-byte base64). Encryption throws if
 * it is missing — we never store these codes in plaintext.
 */

const ALGO = "aes-256-gcm";
const PREFIX = "v1"; // versioned so the scheme can rotate

function getKey(): Buffer {
  const b64 = process.env.ACCESS_CODE_ENC_KEY;
  if (!b64) throw new Error("ACCESS_CODE_ENC_KEY is not set — cannot handle access codes");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("ACCESS_CODE_ENC_KEY must be 32 bytes (base64-encoded)");
  return key;
}

/** True when an encryption key is configured (so the UI can gate code entry). */
export function accessCodeEncryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a code → `v1:<iv>.<tag>.<ciphertext>` (all base64). */
export function encryptAccessCode(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a payload produced by encryptAccessCode. Throws on tamper/wrong key. */
export function decryptAccessCode(payload: string): string {
  const key = getKey();
  const [prefix, body] = payload.split(":");
  if (prefix !== PREFIX || !body) throw new Error("Unrecognised access-code payload");
  const [ivB64, tagB64, ctB64] = body.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed access-code payload");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Is `now` within the reveal window around a job's scheduled start? */
export function isWithinAccessWindow(
  scheduledStart: Date,
  now: Date = new Date(),
  cfg: { windowBeforeHours: number; windowAfterHours: number } = accessCodeConfig
): boolean {
  const start = scheduledStart.getTime() - cfg.windowBeforeHours * 3600_000;
  const end = scheduledStart.getTime() + cfg.windowAfterHours * 3600_000;
  const t = now.getTime();
  return t >= start && t <= end;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Server-side authorisation for revealing an access code. Both conditions MUST
 * hold: the requester is the assigned crew, AND we are inside the time window.
 * Hiding the UI is not access control — call this before decrypting.
 */
export function canRevealAccessCode(params: {
  isAssignedCrew: boolean;
  scheduledStart: Date | null;
  now?: Date;
  isAdmin?: boolean;
}): AccessDecision {
  const { isAssignedCrew, scheduledStart, now = new Date(), isAdmin = false } = params;
  if (isAdmin) return { allowed: true }; // ops/owner may access (still logged)
  if (!isAssignedCrew) return { allowed: false, reason: "Not the assigned crew for this job" };
  if (!scheduledStart) return { allowed: false, reason: "Job has no scheduled time" };
  if (!isWithinAccessWindow(scheduledStart, now)) {
    return { allowed: false, reason: "Outside the permitted access window" };
  }
  return { allowed: true };
}

/**
 * Log an access-code reveal (§6.9). Called on every successful reveal. Uses a
 * lazy import so the crypto module stays free of DB deps for unit testing.
 */
export async function recordAccessCodeView(params: {
  propertyId: string;
  accessorId: string;
  jobId?: string;
  codeType: "lockbox" | "alarm";
}): Promise<void> {
  const { db, hasDatabase } = await import("@/lib/db");
  if (!hasDatabase) {
    console.log(`[access-audit] ${params.accessorId} viewed ${params.codeType} for property ${params.propertyId}`);
    return;
  }
  await db.accessCodeAudit.create({
    data: {
      propertyId: params.propertyId,
      accessorId: params.accessorId,
      jobId: params.jobId ?? null,
      codeType: params.codeType,
    },
  });
}
