# Claude Code — Task Brief: Apply PRD v2.1 pricing and design revisions

Paste this into Claude Code from the repo root. It assumes `mcsecocleaning_PRD_v2.1.md` is in the repo.

---

## Context

You are working on mcsecocleaning, a UK domestic and end-of-tenancy cleaning web app. The build spec is `mcsecocleaning_PRD_v2.1.md` in this repo. It supersedes v2.0.

Two sections were revised after a competitor review of tenancy.cleaning: **§5 (Competitor benchmark subsection)** and **§12 (12.1 through 12.5)**. Read both before writing any code. Do not re-derive the reasoning — it is in the document.

Non-negotiables carried from the PRD, restated because they are easy to break:

- Pricing is a **deterministic rules engine**, never a model call (§7.2)
- One versioned rate card is the **single source of truth** for every surface
- Consumer prices display **VAT-inclusive**, total including all mandatory charges (§5, §14.3)
- Never write an invented review, rating, or trust statistic into the codebase (§10.1, §12.4)

---

## Task 1 — Rate card as single source of truth

Create `/lib/pricing/rate-card.ts` exporting one versioned, typed object.

Required contents:

**End of tenancy fixed grid**, keyed by bedroom × bathroom. Bedrooms 0 (studio) through 5+, bathrooms 1–3. London rates, positioned above the nationwide benchmark in §5 — do NOT copy the competitor's figures, they are national averages. Derive from §5's London market rates and flag your assumptions in a comment block for human review.

**Hourly rates** for regular, one-off and deep cleans, with minimum hours, per the §5 indicative rate card.

**Add-on menu**, per-unit and individually bookable, mirroring the granularity in §5's benchmark table: carpet per area, per rug, hallway, stairs per flight; upholstery by seat count, mattress, curtains; appliances individually (single oven, double oven, range, fridge freezer, washing machine, dishwasher); pressure washing per m².

**Every add-on carries both a price and a duration in minutes** — duration feeds capacity (§7.4).

Requirements:
- Export a `RATE_CARD_VERSION` string. Every `Quote` record stores it.
- Ship a `getRateCard(version?)` accessor so historical quotes resolve against the card that produced them.
- Unit tests covering every grid cell and every add-on. Any future rate change gets a test.
- Nothing else in the codebase may hardcode a price. Grep for currency literals when you finish and fix what you find.

## Task 2 — Homepage rebuild to §12.1

Rebuild the homepage in the twelve-section order specified in §12.1. Read it directly; do not paraphrase from memory.

Points that need care:

**Dual CTA (§12.2).** Two primary buttons in the hero: "Book instantly" and "Get a quote". These are separate routes, not one flow. Both write to the same `Lead`/`Quote` records (§15). The §7.2 escalation rules still apply inside the instant path.

**Price accordion (§12.3).** Collapsed blocks by category on the homepage, real figures inside, reading from `rate-card.ts`. Not a duplicated table. "View full price list" links to `/prices`, which renders from the same object.

**Social proof strip.** Component reads from the `Review` table. If the review count is below 10, render nothing — no placeholder, no sample data (§12.4).

**Trust metrics bar.** Build the component but leave it out of the page layout until real numbers exist. Put the insurance and re-clean guarantee badges in that slot for now.

Constraints: mobile-first, LCP < 2.5s, INP < 200ms, CLS < 0.1. Images via `next/image`. `FAQPage` schema on the FAQ block. WCAG 2.2 AA.

## Task 3 — Prices page

`/prices` renders the complete grid from `rate-card.ts`: every bedroom × bathroom combination with an exact figure, plus the full add-on menu.

Publish real numbers, not "from" prices (§12.3). Show the total including all mandatory charges — drip pricing is a prohibited practice (§14.3).

Add a build-time assertion that homepage and prices-page figures are identical, since they share a source. The competitor ships a £10 discrepancy between their two pages; a test makes that class of bug impossible.

## Task 4 — Guardrails

- `/locations/[district]` only. No city-level pages (§12.5, §6 doorway-page gate).
- Payment methods: card and, for commercial invoices, bank transfer. No cash (§12.5).
- Guarantee copy says **re-clean guarantee**, never a deposit-back promise (§9.5, §12.5).

---

## Before you start

Report back with: current repo structure, which of these already exists, and anything in the PRD that conflicts with what is built. Do not begin coding until I have seen that.

## While you work

- Schema and pricing rules get reviewed by me line by line before merge. Small errors there cost money for months (§13.5).
- Commit per task, not one large commit.
- Flag any place the PRD is ambiguous rather than picking silently.
