/**
 * Seed script — populates ServiceType, AddOn, ServiceArea and LocationPage rows
 * from the typed config so the database mirrors the marketing site.
 *
 * Run once a real DATABASE_URL is provisioned:  npm run db:seed
 * Safe to re-run (idempotent upserts).
 */
import { PrismaClient, PricingModel } from "@prisma/client";
import { services } from "../src/config/services";
import { getRateCard } from "../src/lib/pricing/rate-card";
import { fromPriceFor } from "../src/lib/pricing/from-price";
import { areas, canPublishLocationPage, locationWordCount } from "../src/config/areas";
import { serviceTemplates } from "../src/config/checklists";

const db = new PrismaClient();

async function main() {
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

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
