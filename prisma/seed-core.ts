/**
 * The reference data every environment needs: the owner, service types, add-ons,
 * checklist templates, service areas and the gated location pages.
 *
 * Extracted from `prisma/seed.ts` at L15 so that exactly one piece of code seeds
 * **either** database. The two entry points differ only in which guard they put
 * in front of it:
 *
 *  - `prisma/seed.ts` — the dev entry. Asserts `assertDevDatabase()`, so it
 *    refuses any host that is not the Neon `dev` branch. This is the one the
 *    build agent and every `db:*` script use.
 *  - `scripts/seed-production.ts` — Fola's entry, for launch day. The dev guard
 *    would refuse production (deny-by-default: no `DEV_DB_HOST`, no run), which
 *    left `LAUNCH.md` with no way to seed the database it is about to launch.
 *    It requires an explicit, typed confirmation instead.
 *
 * Idempotent throughout: every write is an upsert, so re-running changes nothing
 * that is already right.
 */

import type { PrismaClient } from "@prisma/client";
import { PricingModel } from "@prisma/client";

import { services } from "../src/config/services";
import { getRateCard } from "../src/lib/pricing/rate-card";
import { fromPriceFor } from "../src/lib/pricing/from-price";
import { areas, canPublishLocationPage, locationWordCount } from "../src/config/areas";
import { serviceTemplates } from "../src/config/checklists";

/**
 * The single owner account (§3 RBAC) — only a seeded role reaches `/admin`.
 *
 * Overridable with `OWNER_EMAIL` because the committed default is a business
 * fact nobody has confirmed, and launch day is exactly when it has to be right.
 * A wrong value here is not dangerous, only locked out: add the right row and
 * re-seed.
 */
export const DEFAULT_OWNER_EMAIL = "mcsecocleaning@gmail.com";

export async function seedReferenceData(
  db: PrismaClient,
  options: { ownerEmail?: string } = {},
): Promise<void> {
  const ownerEmail = (options.ownerEmail ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase();

  // Owner (RBAC, §3) — only seeded roles reach /admin. This is the single owner
  // account; the rate-card editor (§9.7) is owner-only. Additional admin/ops users
  // are added later. Idempotent: re-seeding keeps the role owner.
  await db.user.upsert({
    where: { email: ownerEmail },
    update: { role: "owner" },
    create: { email: ownerEmail, name: "Owner", role: "owner" },
  });

  // Service types
  for (const s of services) {
    await db.serviceType.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        pricingModel: s.pricingModel as PricingModel,
        minimumValue: fromPriceFor(s.slug).pence ?? 0,
        remedyWindowHours: s.remedyWindowHours,
        active: true,
      },
      create: {
        slug: s.slug,
        name: s.name,
        pricingModel: s.pricingModel as PricingModel,
        baseRates: {},
        durationRates: {},
        minimumValue: fromPriceFor(s.slug).pence ?? 0,
        remedyWindowHours: s.remedyWindowHours,
        active: true,
      },
    });
  }

  // Add-ons — from the rate card (single source). `durationMinutes` stores the
  // add-on's crew-minutes (total labour); `price` is the VAT-inclusive pence.
  for (const a of getRateCard().addOns) {
    await db.addOn.upsert({
      where: { slug: a.slug },
      update: { name: a.name, price: a.pricePence, durationMinutes: a.crewMinutes, serviceTypeIds: a.appliesTo },
      create: {
        slug: a.slug,
        name: a.name,
        price: a.pricePence,
        durationMinutes: a.crewMinutes,
        serviceTypeIds: a.appliesTo,
      },
    });
  }

  // Service templates (checklists, §6.12)
  for (const tpl of serviceTemplates) {
    const st = await db.serviceType.findUnique({ where: { slug: tpl.serviceSlug } });
    if (!st) continue;
    const existing = await db.serviceTemplate.findFirst({
      where: { serviceTypeId: st.id, name: tpl.name },
    });
    const data = {
      serviceTypeId: st.id,
      name: tpl.name,
      items: tpl.items as unknown as object,
    };
    if (existing) {
      await db.serviceTemplate.update({ where: { id: existing.id }, data });
    } else {
      await db.serviceTemplate.create({ data });
    }
  }

  // Service areas + gated location pages
  for (const area of areas) {
    for (const district of area.postcodeDistricts) {
      const sa = await db.serviceArea.upsert({
        where: { postcodeDistrict: district.toUpperCase() },
        update: { areaName: area.name, slug: area.slug, active: area.active, patchGroup: area.patchGroup },
        create: {
          postcodeDistrict: district.toUpperCase(),
          areaName: area.name,
          slug: area.slug,
          active: area.active,
          patchGroup: area.patchGroup,
        },
      });

      for (const sc of area.serviceContent ?? []) {
        const st = await db.serviceType.findUnique({ where: { slug: sc.serviceSlug } });
        if (!st) continue;
        const gate = canPublishLocationPage(area, sc.serviceSlug);
        await db.locationPage.upsert({
          where: { serviceTypeId_serviceAreaId: { serviceTypeId: st.id, serviceAreaId: sa.id } },
          update: {
            wordCount: locationWordCount(area, sc.serviceSlug),
            published: gate.ok,
          },
          create: {
            serviceTypeId: st.id,
            serviceAreaId: sa.id,
            slug: `${sc.serviceSlug}-${area.slug}`,
            content: sc.intro,
            wordCount: locationWordCount(area, sc.serviceSlug),
            published: gate.ok,
          },
        });
      }
    }
  }

}
