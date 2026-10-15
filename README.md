# mcsecocleaning

A UK eco-friendly cleaning company platform: a search-optimised marketing site, an online booking & payments system, an operations/crew system, and a customer portal. Built to the spec in [`PRD.md`](PRD.md).

**Status: Phases 1–2 built (marketing site, booking, payments) — never yet run against a real database or Stripe. Phases 3–5 are in progress as stages L1–L15.** See [`PROGRESS.md`](PROGRESS.md) for where the build stands, what needs Fola, and the business inputs still required before launch. The rules the build follows are in [`CLAUDE.md`](CLAUDE.md); the blueprint is [`PRD.md`](PRD.md).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, SSR/SSG), React 19, TypeScript |
| Styling | Tailwind CSS v4, custom eco design system |
| Database | Neon PostgreSQL via Prisma 6 (eu-west-2) |
| Scheduler/queue | Inngest (durable cron + event functions) |
| Payments | Stripe (built) |
| Email / SMS | Resend / Twilio |
| Object storage | Cloudflare R2 (stage L7) |
| Hosting | Vercel (London) |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

Without a database or API keys the site still runs: lead submissions are logged
to the server console, and pages render from typed config.

### With a database

```bash
# set DATABASE_URL + DIRECT_URL in .env.local, then:
npm run db:push     # create the schema
npm run db:seed     # seed service types, areas, gated location pages
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (typecheck + prerender) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` / `db:migrate` | Apply schema |
| `npm run db:seed` | Seed reference data |
| `npm run db:studio` | Prisma Studio |

## Project structure

```
src/
  app/                     App Router pages, route handlers, sitemap/robots/llms
    [service]/             Service hub + content-gated [area] location pages
    api/inngest/           Durable scheduler endpoint
    actions/               Server actions (lead capture)
  components/              layout, marketing, ui, analytics
  config/                  site (NAP), services, areas, business data
  content/                 blog articles
  lib/                     money/VAT, db, email, serviceArea, seo, inngest
prisma/                    schema + seed
docs/                      PRD, build status, deployment, Phase 0 checklist
```

## Key implementation notes

- **Money is VAT-aware from day one** (`src/lib/money.ts`): every price is
  net/vat/gross in pence; `VAT_REGISTERED` flips on without a migration (§10.1).
- **Schedule and billing are decoupled** in the schema: Jobs are materialised
  from a Subscription's RRULE and exist independently of payment status (§6.2).
- **Location pages are content-gated** (`src/config/areas.ts`): a service×area
  page will not publish without ≥400 area-specific words, a local photo, a local
  review and an area price note — anti-doorway protection (§5.3).
- **Reviews are shown but never marked up as `AggregateRating`** (§5.2).
- **Cookie consent gates GA4**; nothing tracks before opt-in (§10.3).

## Before launch

Fill the `TODO(business-input)` placeholders (search the repo) — chiefly
`src/config/site.ts` (NAP, company number, domain) and pricing in
`src/config/services.ts`. See [`docs/PHASE-0-CHECKLIST.md`](docs/PHASE-0-CHECKLIST.md)
and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
