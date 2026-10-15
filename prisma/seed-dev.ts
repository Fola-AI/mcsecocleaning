/**
 * Realistic development data (§13.3, PRD §16.3 → L3).
 *
 * §13.3 asks for this early and says why: *"Seed realistic test data early —
 * twenty customers, fifty jobs, three crews. Admin views look fine empty and
 * fall apart in use."* That is exactly what happened to the old counts
 * dashboard, which read perfectly with three zeroes on it.
 *
 * ## What it refuses to do
 *
 * Two guards, because this writes a lot of rows that must never be mistaken for
 * real ones:
 *
 *  1. **The dev-database guard** (`assertDevDatabase`), same as every other
 *     write path — the host must equal `DEV_DB_HOST`.
 *  2. **`APP_ENV` must not be `production`**, independently of the host. A
 *     production database reachable under a dev host name is not a scenario
 *     worth being relaxed about.
 *
 * Every row it creates is marked: customers are `@example.com` (a reserved
 * domain that cannot receive mail), and every job's notes begin with the tag
 * below. `CLAUDE.md` forbids seed data on public routes — these are customers,
 * jobs and crews, none of which the marketing site renders, and the one public
 * surface that reads the database (reviews) is deliberately left alone: no
 * `Review` rows are created here, because an invented review is exactly what
 * the content rules prohibit.
 *
 * Idempotent by tag: re-running deletes what it created before and rebuilds it,
 * so the dataset stays the stated size rather than growing each time. It clears
 * every `@example.com` customer, which also sweeps up the leftovers of an E2E
 * run — deliberate, since both are development debris, but it does mean running
 * this between gate runs removes the jobs those gates created.
 *
 * Usage:  npm run db:seed:dev
 */

import "../scripts/load-env";

import { PrismaClient, type JobStatus, type PaymentStatus } from "@prisma/client";

import { assertDevDatabase } from "../scripts/assert-dev-db";
import { computeQuote } from "../src/lib/quote";
import { priceFromRateCard } from "../src/lib/money";
import { zonedWallTimeToUtc } from "../src/lib/timezone";

const db = new PrismaClient();

/** Every row this script creates carries this, so it can find and replace them. */
export const DEV_SEED_TAG = "[dev-seed]";
const DEV_EMAIL_DOMAIN = "example.com";

const FIRST_NAMES = [
  "Amara", "Ben", "Chloe", "Dev", "Esme", "Femi", "Grace", "Hassan", "Iris", "Jonas",
  "Kemi", "Leah", "Marcus", "Nadia", "Owen", "Priya", "Quinn", "Rosa", "Sam", "Tara",
];
const SURNAMES = [
  "Adeyemi", "Barnes", "Carlisle", "Dube", "Ellis", "Fraser", "Gallagher", "Hughes",
  "Ibrahim", "Jensen", "Kaur", "Lawson", "Mbeki", "Novak", "Osei", "Patel", "Quigley",
  "Reyes", "Shah", "Thornton",
];

/** Streets by district, so a seeded address is plausible for its postcode. */
const DISTRICTS: { postcode: string; streets: string[] }[] = [
  { postcode: "SW4 7AA", streets: ["Abbeville Road", "The Chase", "Elms Crescent"] },
  { postcode: "SW11 1AB", streets: ["Lavender Hill", "Battersea Rise", "Webbs Road"] },
  { postcode: "SW2 1AA", streets: ["Brixton Water Lane", "Effra Road", "Dalberg Road"] },
  { postcode: "SE11 4AA", streets: ["Kennington Road", "Cleaver Square", "Braganza Street"] },
  { postcode: "SE15 2AA", streets: ["Bellenden Road", "Choumert Road", "Lyndhurst Way"] },
  { postcode: "SW18 2AA", streets: ["Replingham Road", "Merton Road", "Allfarthing Lane"] },
  // Bromley is its own patch (§4, §7.5) — a seeded dataset that never touches it
  // would hide the one rule the capacity model is strictest about.
  { postcode: "BR1 1AA", streets: ["Widmore Road", "Plaistow Lane", "College Road"] },
];

const SERVICES = ["domestic-cleaning", "end-of-tenancy-cleaning", "deep-cleaning"] as const;

/**
 * The spread of statuses. Weighted towards a working business rather than evenly
 * split: mostly completed history, a live week ahead, and a few of each failure
 * so the admin screens are exercised by the cases that matter.
 */
const STATUS_PLAN: { status: JobStatus; count: number; paymentStatus: PaymentStatus }[] = [
  { status: "completed", count: 16, paymentStatus: "captured" },
  { status: "closed", count: 6, paymentStatus: "captured" },
  { status: "awaiting_feedback", count: 3, paymentStatus: "captured" },
  { status: "scheduled", count: 9, paymentStatus: "authorised" },
  { status: "booked", count: 5, paymentStatus: "pending" },
  { status: "payment_authorised", count: 3, paymentStatus: "authorised" },
  { status: "in_progress", count: 2, paymentStatus: "authorised" },
  { status: "cancelled", count: 2, paymentStatus: "refunded" },
  { status: "on_hold", count: 1, paymentStatus: "pending" },
  { status: "no_access", count: 1, paymentStatus: "failed" },
  { status: "draft", count: 2, paymentStatus: "pending" },
];

/** A deterministic pseudo-random sequence, so two runs give the same dataset. */
function sequence(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

async function clearPreviousDevSeed(): Promise<void> {
  // Order matters: children before parents, and the seed's own rows only.
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${DEV_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const jobs = await db.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  await db.$transaction([
    db.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } }),
    db.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } }),
    db.payment.deleteMany({ where: { jobId: { in: jobIds } } }),
    db.job.deleteMany({ where: { id: { in: jobIds } } }),
    db.subscription.deleteMany({ where: { customerId: { in: ids } } }),
    db.quote.deleteMany({ where: { customerId: { in: ids } } }),
    db.property.deleteMany({ where: { customerId: { in: ids } } }),
    db.crewUnavailability.deleteMany({ where: { crew: { userId: { in: ids } } } }),
    db.crewProfile.deleteMany({ where: { userId: { in: ids } } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log(`  cleared ${ids.length} previous dev-seed users and their rows`);
}

async function main(): Promise<void> {
  assertDevDatabase();
  if (process.env.APP_ENV === "production") {
    throw new Error(
      "Refusing: APP_ENV is production. This script writes 20 fake customers and 50 fake jobs; " +
        "they must never exist in a production database, whatever the host says.",
    );
  }

  const serviceTypes = await db.serviceType.findMany();
  if (serviceTypes.length === 0) {
    throw new Error("No ServiceType rows — run `npm run db:seed` first (this script builds on it).");
  }
  const serviceTypeBySlug = new Map(serviceTypes.map((s) => [s.slug, s]));

  console.log("Dev seed (§13.3): 20 customers, 50 jobs, 3 crews.");
  await clearPreviousDevSeed();

  const rand = sequence(20261015);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

  // ── Three crews, across both patches ──────────────────────────────────────
  const crewNames = ["Ada Mensah", "Bruno Silva", "Carys Lloyd"];
  const crews = [];
  for (const [index, name] of crewNames.entries()) {
    const crew = await db.user.create({
      data: {
        email: `crew${index + 1}@${DEV_EMAIL_DOMAIN}`,
        name,
        role: "crew",
        phone: `07700 9001${index}0`,
        crewProfile: {
          create: {
            payType: "hourly",
            // Dev figures only; real pay rates are an L10 / Fola decision.
            payRate: 1400 + index * 100,
            workingHours: {
              1: [{ start: "08:00", end: "18:00" }],
              2: [{ start: "08:00", end: "18:00" }],
              3: [{ start: "08:00", end: "18:00" }],
              4: [{ start: "08:00", end: "18:00" }],
              5: [{ start: "08:00", end: "18:00" }],
              ...(index === 2 ? { 6: [{ start: "09:00", end: "16:00" }] } : {}),
            },
            dbsCheckedAt: new Date(Date.UTC(2026, 5, 1 + index)),
            // One of each compliance state, so the roster screen's warnings are
            // exercised rather than permanently green: valid, expiring inside the
            // 60-day window, and one left unrecorded — which is the state that
            // looks fine and means nobody has checked.
            dbsExpiresAt:
              index === 0
                ? new Date(Date.UTC(2028, 5, 1))
                : index === 1
                  ? new Date(Date.now() + 21 * 86_400_000)
                  : null,
            insuranceExpiresAt: index === 2 ? new Date(Date.now() - 5 * 86_400_000) : new Date(Date.UTC(2027, 11, 31)),
            startDate: new Date(Date.UTC(2026, 4, 1)),
          },
        },
      },
    });
    crews.push(crew);
  }
  console.log(`  ${crews.length} crews`);

  // ── Twenty customers, each with a property ────────────────────────────────
  const customers = [];
  for (let i = 0; i < 20; i++) {
    const name = `${FIRST_NAMES[i]} ${SURNAMES[(i * 7) % SURNAMES.length]}`;
    const district = DISTRICTS[i % DISTRICTS.length];
    const customer = await db.user.create({
      data: {
        email: `customer${i + 1}@${DEV_EMAIL_DOMAIN}`,
        name,
        role: "customer",
        phone: `07700 900${String(i).padStart(3, "0")}`,
        marketingConsent: i % 3 === 0,
        consentUpdatedAt: i % 3 === 0 ? new Date() : null,
        properties: {
          create: {
            addressLine1: `${1 + Math.floor(rand() * 90)} ${pick(district.streets)}`,
            city: "London",
            postcode: district.postcode,
            propertyType: rand() > 0.5 ? "flat" : "house",
            roomCounts: {
              bedrooms: 1 + Math.floor(rand() * 4),
              bathrooms: 1 + Math.floor(rand() * 2),
              receptions: 1,
              kitchens: 1,
            },
            entryMethod: pick(["client_present", "key_held", "lockbox", "concierge"]),
            parkingNotes: pick(["Resident bays, visitor permit in the porch", "Free after 18:30", "Single yellow outside"]),
            accessNotes: `${DEV_SEED_TAG} development data`,
          },
        },
      },
      include: { properties: true },
    });
    customers.push(customer);
  }
  console.log(`  ${customers.length} customers with a property each`);

  // ── Fifty jobs across every status ────────────────────────────────────────
  const now = new Date();
  let created = 0;
  let dayOffset = -30;

  for (const plan of STATUS_PLAN) {
    for (let n = 0; n < plan.count; n++) {
      const customer = customers[created % customers.length];
      const property = customer.properties[0];
      const serviceSlug = pick(SERVICES);
      const serviceType = serviceTypeBySlug.get(serviceSlug);
      if (!serviceType) continue;

      const rooms = property.roomCounts as Record<string, number>;
      const quote = computeQuote({
        serviceSlug,
        rooms: {
          bedrooms: rooms.bedrooms ?? 1,
          bathrooms: rooms.bathrooms ?? 1,
          receptions: rooms.receptions ?? 1,
          kitchens: rooms.kitchens ?? 1,
          hallways: 0,
          studies: 0,
          conservatories: 0,
        },
        frequency: "one_off",
      });
      if (quote.escalate) continue;

      // Past statuses get past dates, live ones get today or the week ahead —
      // otherwise the Today view and the job board show a nonsense timetable.
      const isPast = ["completed", "closed", "awaiting_feedback", "cancelled", "no_access"].includes(plan.status);
      const isToday = plan.status === "in_progress" || (plan.status === "scheduled" && n < 3);
      const offset = isToday ? 0 : isPast ? dayOffset++ : 1 + Math.floor(rand() * 10);
      const day = new Date(now.getTime() + offset * 86_400_000);
      const hour = 8 + Math.floor(rand() * 8);
      const start = zonedWallTimeToUtc(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        // In-progress jobs must have started already, or the Today view would
        // read them as not yet due.
        plan.status === "in_progress" ? Math.max(8, new Date().getUTCHours() - 1) : hour,
        0,
      );

      const money = priceFromRateCard(quote.chargeNow.gross);
      const job = await db.job.create({
        data: {
          customerId: customer.id,
          propertyId: property.id,
          serviceTypeId: serviceType.id,
          status: plan.status,
          scheduledStart: plan.status === "draft" ? null : start,
          scheduledEnd:
            plan.status === "draft" ? null : new Date(start.getTime() + quote.elapsedMinutes * 60_000),
          estimatedDurationMinutes: quote.crewMinutes,
          net: money.net,
          vatRate: money.vatRate,
          vatAmount: money.vatAmount,
          gross: quote.chargeNow.gross,
          paymentStatus: plan.paymentStatus,
          source: pick(["web", "phone", "admin"]),
          notes: `${DEV_SEED_TAG} ${serviceType.name} for ${customer.name}`,
        },
      });

      // A Payment row that matches the job's payment status, so the payments
      // queue and the failed-payment bucket have something true to show.
      if (plan.paymentStatus !== "pending" || plan.status === "no_access") {
        await db.payment.create({
          data: {
            jobId: job.id,
            type: "charge",
            net: money.net,
            vatAmount: money.vatAmount,
            gross: quote.chargeNow.gross,
            status: plan.paymentStatus === "refunded" ? "refunded" : plan.paymentStatus,
            capturedAt: plan.paymentStatus === "captured" ? start : null,
          },
        });
      }

      // Most jobs have a crew; a few deliberately do not, so "unassigned" is a
      // real bucket on the Today view rather than a permanently empty one.
      const leaveUnassigned = ["booked", "draft"].includes(plan.status) || (isToday && n === 0);
      if (!leaveUnassigned) {
        const crew = crews[created % crews.length];
        await db.jobAssignment.create({ data: { jobId: job.id, crewId: crew.id, isLead: true } });
      }

      await db.jobStatusEvent.create({
        data: { jobId: job.id, toStatus: plan.status, note: `${DEV_SEED_TAG} seeded as ${plan.status}` },
      });

      created++;
    }
  }
  console.log(`  ${created} jobs across ${STATUS_PLAN.length} statuses`);

  const unassignedToday = await db.job.count({
    where: { assignments: { none: {} }, status: { in: ["booked", "scheduled", "payment_authorised"] } },
  });
  const failed = await db.payment.count({ where: { status: "failed", type: "charge" } });
  console.log(`\n✓ dev seed complete — ${unassignedToday} unassigned upcoming, ${failed} failed payment(s).`);
  console.log("  Every row is tagged and every customer is @example.com. Public routes render none of it.");
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
