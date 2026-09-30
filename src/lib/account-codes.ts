import { encryptAccessCode } from "@/lib/access-codes";

/**
 * Turn a submitted access-code value into the encrypted field to store, or undefined
 * to LEAVE THE EXISTING CODE UNCHANGED (§9.3). A blank/whitespace value returns
 * undefined so the caller omits the column from the update — a bug here would
 * silently wipe a lockbox code and lock the crew out. A real value is encrypted
 * (never stored or echoed in plaintext). Pure + unit-tested. Lives outside the
 * "use server" action module because only async server actions may be exported there.
 */
export function encryptedCodeFieldValue(submitted: string | null | undefined): string | undefined {
  const v = (submitted ?? "").trim();
  if (!v) return undefined; // blank → do not touch the stored code
  return encryptAccessCode(v);
}
