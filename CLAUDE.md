@AGENTS.md

# mcsecocleaning — build guide for Claude

Full-stack platform for a UK eco-friendly cleaning company. The build spec is
[`docs/PRD_v2.md`](docs/PRD_v2.md); it is authoritative. Build phases sequentially
(§13). Current state and remaining work: [`docs/BUILD-STATUS.md`](docs/BUILD-STATUS.md).

## Non-negotiables (from the PRD — do not regress)

- **UK English everywhere** in code and copy. Use the §5.5 terminology:
  "domestic cleaning" (not residential), "end of tenancy" (not move-out),
  "communal area", "after builders", "postcode" (not ZIP).
- **Money**: never a single `price` field. Use `src/lib/money.ts` — everything is
  net/vat/gross in integer pence. `VAT_REGISTERED` ships `false`, flips with no
  migration. Consumer prices display VAT-inclusive; commercial shows net+VAT+gross.
- **Schedule ≠ billing** (§6.2): Jobs are materialised from a Subscription's
  RRULE by the scheduler and exist independently of `paymentStatus`. Never
  generate/delete Jobs from Stripe webhooks.
- **Location-page content gate** (§5.3): enforce `canPublishLocationPage` — no
  templated near-duplicate pages (doorway abuse). ≥400 area words + local photo +
  local review + area price note.
- **No `AggregateRating` markup** on self-collected reviews (§5.2).
- **PECR**: GA4 only loads after consent (`ConsentAnalytics`). Marketing honours
  consent + carries unsubscribe.
- **CCR 14-day** consent must be captured, versioned and stored at payment (§10.2)
  — Phase 2.
- **Access codes**: encrypted at rest, time-scoped to the assigned crew, every
  access logged (§6.9) — Phase 3.
- **Webhook idempotency**: store `event.id`, reject replays (`WebhookEvent`) — Phase 2.
- **Timezone**: store UTC, render Europe/London; RRULE via `rrule.js`, never hand-rolled.

## Conventions

- Server components by default; `"use client"` only where interactivity needs it.
- `params`/`searchParams` are Promises (Next 16) — `await` them.
- Business facts come from `src/config/*` and `src/lib/money.ts`, not hardcoded in pages.
- `TODO(business-input)` = a real value the owner must supply; `TODO(pricing)` =
  needs the cost-per-crew-hour model; `TODO(legal)` = solicitor review.

## Commands

`npm run build` (typecheck + prerender), `npm run lint`, `npm run db:push`,
`npm run db:seed`. Verify the build after changes.
