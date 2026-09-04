/**
 * Discount application logic (§6.14). Pure and testable. Resolution (DB vs
 * config) is separate so the maths can be unit-tested without a database.
 */
import { discountByCode, type DiscountCodeData } from "@/config/discounts";
import { db, hasDatabase } from "@/lib/db";

export interface DiscountContext {
  serviceSlug: string;
  amountGross: number; // pence to discount (the charge-now amount)
  frequency?: "one_off" | "weekly" | "fortnightly" | "monthly";
  now?: Date;
}

export type DiscountOutcome =
  | { ok: true; code: string; discountAmount: number; finalGross: number }
  | { ok: false; reason: string };

/** Apply a discount definition to a context. Never returns a negative price. */
export function applyDiscount(dc: DiscountCodeData, ctx: DiscountContext): DiscountOutcome {
  const now = ctx.now ?? new Date();

  if (dc.validFrom && now < new Date(dc.validFrom)) return { ok: false, reason: "This code isn't active yet." };
  if (dc.validUntil && now > new Date(dc.validUntil)) return { ok: false, reason: "This code has expired." };
  if (dc.maxUses != null && (dc.uses ?? 0) >= dc.maxUses) return { ok: false, reason: "This code has been fully redeemed." };

  if (dc.serviceSlugs && dc.serviceSlugs.length > 0 && !dc.serviceSlugs.includes(ctx.serviceSlug)) {
    return { ok: false, reason: "This code doesn't apply to that service." };
  }
  if (dc.requiresFrequency && dc.requiresFrequency.length > 0) {
    if (!ctx.frequency || ctx.frequency === "one_off" || !dc.requiresFrequency.includes(ctx.frequency)) {
      return { ok: false, reason: "This code applies to a recurring booking." };
    }
  }

  let discountAmount =
    dc.type === "percent"
      ? Math.round((ctx.amountGross * dc.value) / 100)
      : Math.min(dc.value, ctx.amountGross);

  discountAmount = Math.max(0, Math.min(discountAmount, ctx.amountGross));
  return {
    ok: true,
    code: dc.code.toUpperCase(),
    discountAmount,
    finalGross: ctx.amountGross - discountAmount,
  };
}

/** Resolve a code from the DB (preferred) or the launch config. */
export async function resolveDiscountCode(code: string): Promise<DiscountCodeData | null> {
  const trimmed = code.trim().toUpperCase();
  if (hasDatabase) {
    try {
      const row = await db.discountCode.findUnique({ where: { code: trimmed } });
      if (row) {
        return {
          code: row.code,
          type: row.type,
          value: row.value,
          serviceSlugs: row.serviceTypeIds,
          maxUses: row.maxUses ?? undefined,
          uses: row.uses,
          validFrom: row.validFrom?.toISOString(),
          validUntil: row.validUntil?.toISOString(),
          singleUsePerCustomer: row.singleUsePerCustomer,
        };
      }
    } catch (e) {
      console.error("[discount] DB lookup failed, falling back to config", e);
    }
  }
  return discountByCode(trimmed) ?? null;
}

/** Resolve + apply in one step (used by booking). */
export async function resolveAndApply(code: string, ctx: DiscountContext): Promise<DiscountOutcome> {
  const dc = await resolveDiscountCode(code);
  if (!dc) return { ok: false, reason: "That code wasn't recognised." };
  return applyDiscount(dc, ctx);
}
