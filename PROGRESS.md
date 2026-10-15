# PROGRESS.md — mcsecocleaning build log

> **For Fola:** this is the one file to check. The top section shows where things stand and whether anything needs you. **For Claude Code:** this is the only status file you write. Update it after every completed item.

## ✅ Stop cleared — 15 Oct 2026 · all nine L2 keys present, D7 answered

The 15 Oct stop (`.env.local` present but 7 of its 9 L2 keys empty) is **cleared**.
Fola filled the six Neon/Stripe/Resend values and `DEV_EMAIL_REDIRECT`, and answered
**SETUP D7 = A** in `f554149`. Checked this session, names and shapes only — no key
value was read, printed or logged:

| L2 key | State |
| --- | --- |
| `DATABASE_URL` | ✅ set — Neon pooled host (`…-pooler.c-2.eu-west-2.aws.neon.tech`) |
| `DIRECT_URL` | ✅ set — same branch, direct host |
| `DEV_DB_HOST` | ✅ set — equals the `DIRECT_URL` host exactly, so the L1 guard can prove its target |
| `STRIPE_SECRET_KEY` | ✅ set — prefix `sk_test_` (test mode; a `sk_live_` prefix would be a hard stop) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ set — prefix `pk_test_` |
| `RESEND_API_KEY` | ✅ set — prefix `re_` |
| `DEV_EMAIL_REDIRECT` | ✅ set — a personal inbox; every non-production email goes here |
| `AUTH_SECRET` | ✅ generated (44 chars) |
| `ACCESS_CODE_ENC_KEY` | ✅ generated (44 chars) |

**The guard now confirms rather than refuses**, which is the first evidence that the
environment is real:

```
$ npx tsx scripts/assert-dev-db.ts
✓ dev database confirmed (ep-red-scene-zamnwn4a.c-2.eu-west-2.aws.neon.tech) — proceeding.
exit: 0
```

The `dev` branch is **empty** (`0` tables in `public`), so the L2 baseline-then-migrate
sequence runs on a clean database with nothing to lose:

```
$ psql "$DIRECT_URL" -At -c "select count(*) from information_schema.tables where table_schema='public';"
0
```

`STRIPE_WEBHOOK_SECRET` is still empty, which is **correct and not a block** — per
`SETUP.md` §3.3 step 3 it is produced by `stripe listen` at the start of each local
session, not pasted in. L7/L9/L11/L12/L14 keys remain empty as expected.

**D7 = A** (`SETUP.md` §1, read not inferred: box A ticked, B and C unticked). So L2
builds gap 2 as *save the card at booking and charge it off-session on completion* for
any booking more than ~6 days ahead and every recurring visit. **Q-10 is answered**;
the customer-facing consent wording that mechanism needs is legal wording, so it is
drafted and parked, per the L2 stage text.

## Status

| | |
| --- | --- |
| **Current stage** | **L2 — ⏳ in progress, started 15 Oct 2026.** The environment block is cleared: all nine L2 keys are present, Stripe is in test mode, the dev-db guard confirms its target, and SETUP D7 is answered (A) |
| **Next action** | *(Claude Code)* work the L2 plan in order — baseline the Neon `dev` branch at the pre-migration-#1 schema, apply manual migrations #1–#9, empty drift check, seed, then Playwright gates A/B/C/D, the payment-link reissue, and the three Phase 2 gaps from the 9 Oct review (PRD §16.1). The L2 checklist with per-item state is in the **L2 stage log** below |
| **Working branch** | `build/autonomous` on GitHub — the fix-branch work plus 4 L1 commits, the 9 Oct documentation repair, the root move and D7 |
| **Last updated** | 15 Oct 2026 — **L2 unblocked and started.** All nine L2 keys verified present (names and prefixes only); `sk_test_`/`pk_test_` confirm test mode; `DEV_DB_HOST` matches the `DIRECT_URL` host; the Neon `dev` branch is reachable and empty; D7 = A, so Q-10 is answered and gap 2 is built rather than parked. Earlier 15 Oct — `.env.local` created from the §4 template, stale `.env` removed, Q-13 resolved. 9 Oct — external review, documents revised to PRD v2.2.1. 8 Oct — L1 complete |
| **Needs Fola?** | **Not to proceed.** Two things wait for a merge checkpoint or a spare moment: the drafted card-on-file consent wording (Q-14, legal — L2 does not ship it unapproved), and D3–D6 which park only later-stage items. 9 live *Open questions* (Q-6, Q-10 and Q-13 resolved); the *Review queue* grows through L2 for merge checkpoint 1 |

## Stage tracker

| Stage | Title | Status | Merge checkpoint |
| --- | --- | --- | --- |
| L1 | Reconcile and guardrails | ✅ Done | |
| L2 | Real database and Stripe test-mode gate (+ Phase 2 gaps 1–3, gate D — added 9 Oct) | ⏳ In progress — keys present, started 15 Oct 2026 | ✅ 1 |
| L3 | Admin operations core | ⛔ Blocked by L2 | |
| L4 | Crew roster, capacity and availability | ⛔ Blocked by L2 | |
| L5 | Crew mobile interface | ⛔ Blocked by L2 | |
| L6 | Access codes | ⛔ Blocked by L2 | ✅ 2 |
| L7 | Media exchange | ⛔ Blocked by L2 | |
| L8 | Quality checklists | ⛔ Blocked by L2 | |
| L9 | Notifications and recurring self-service | ⛔ Blocked by L2 | |
| L10 | Payroll and owner rate-card editor | ⛔ Blocked by L2 | ✅ 3 |
| L11 | Commercial RFQ, invoicing and Bacs | ⛔ Blocked by L2 | |
| L12 | Reviews, growth and content gaps | ⛔ Blocked by L2 | |
| L13 | Issue resolution and data rights | ⛔ Blocked by L2 | ✅ 4 |
| L14 | Launch hardening | ⛔ Blocked by L2 | |
| L15 | Release candidate and LAUNCH.md | ⛔ Blocked by L2 | ✅ 5 |

Legend: ☐ not started · ⏳ in progress · ✅ done (evidence below) · ⛔ blocked (reason in stage log)

---

## Baseline — verified against `fix/pre-phase3-gate` (head `2cfdf3d`), 8 Oct 2026

Earlier figures in this file came from a 30 Sep snapshot of `main` and were wrong for the working branch. These are measured.

| | `main` | `fix/pre-phase3-gate` (working branch) |
| --- | --- | --- |
| TypeScript files in `src/` | 119 | **126** (~12,600 lines) |
| Test files | 14 | **18** |
| Unit tests passing | — | **127** |
| Prisma models / enums | 36 / 20 | **36 / 20** (unchanged) |
| Manual migrations | 6 | **9** |

The branch was 6 commits ahead of `main` and had **never been pushed**. `build/autonomous` is cut from it and is now on GitHub.

> This table is the **pre-L1 baseline**, fixed at commit `2cfdf3d`, and is deliberately not updated as stages land — it is what each stage's work is measured against. After L1 the branch stands at 130 `src/` files, 21 test files and **190 tests**; see the L1 evidence below. Nothing in it is on GitHub.

### Verify gate — all green on the working branch

```
$ npm run typecheck     # tsc --noEmit
(no output — clean)

$ npm run lint          # eslint
(no output — clean)

$ npm test              # node --import tsx --test "src/**/*.test.ts"
ℹ tests 127
ℹ pass 127
ℹ fail 0
ℹ duration_ms 510.212291

$ npm run build         # prisma generate + check-price-parity + next build
✓ built — 38 routes prerendered/served
  ○ static · ● SSG · ƒ dynamic; middleware active
```

The drift check (`prisma migrate diff`) has **not** been run — there is no database to run it against. That is L2's first job.

### Phase 1 — marketing site: built
- Next.js 16.3.4 / React 19.2.8 / Tailwind v4, Vercel `lhr1`, served on `*.vercel.app`.
- `noindex` enforced by the build guard (`src/lib/seo/indexing-guard.ts`, called from `next.config.ts`): a production build on a real custom domain throws unless `NEXT_PUBLIC_ALLOW_INDEXING="true"`.
- Routes: home, six service hubs `/[service]`, gated location pages `/[service]/[area]`, prices, about, contact, guarantee, areas-we-cover, reviews, eco-cleaning, blog (3 articles), legal (privacy, cookies, terms, cancellation-policy).
- SEO: JSON-LD (no `AggregateRating`), sitemap, robots, `llms.txt`, OG image.
- GA4 behind consent (`ConsentAnalytics`).
- Lead capture covers RFQ, waitlist and `domestic_sales` escalation.
- Areas are the §4 cluster with `patchGroup`: Kennington, Elephant & Castle, Brixton, Battersea, Wandsworth, Peckham, Clapham (core) and Bromley.
- Inngest crons (`src/lib/inngest/`): heartbeat, subscription materialisation, verification-token sweep, deposit nudge.
- **Not done:** real company details — 26 `PLACEHOLDER` values in `src/config/site.ts`. Also Search Console, SPF/DKIM/DMARC, Sentry, uptime monitoring, real photography.

### Phase 2 — booking and payments: built, never run against a real DB or Stripe
- **Pricing:** rate card `src/lib/pricing/rate-card.ts` (EOT grid by flat/house × beds × baths; hourly services; add-ons); quote engine `src/lib/quote.ts` (EOT instant-priced, escalation only at 5+ bedrooms or heavily soiled); `fromPriceFor` derives the true floor; parity check runs inside `npm run build`.
- **Booking:** capacity `src/lib/capacity.ts` reads the **placeholder roster in `src/config/availability.ts`**, not the database; 8-step wizard on real slots with versioned CCR consent; pre-contract email; recurrence `src/lib/recurrence.ts` tested across BST/GMT and bank holidays; discount codes and CSV import.
- **Payments** (`src/lib/payments.ts`, `src/lib/stripe.ts`, `src/lib/webhook-reconcile.ts`, `src/app/actions/payments.ts`): authorise at booking; 25% deposit when gross > £250 or > 300 minutes (`src/config/payments.ts`); `markJobComplete`, `retryCapture`, `cancelAndRefundBooking`, `rechargeOutstanding`; webhook at `/api/stripe/webhook` with `WebhookEvent` idempotency.
- **Admin:** `/admin` counts dashboard only; `/admin/jobs` (complete/capture), `/admin/leads` (convert), `/admin/bookings/new`, `/admin/import`. Access via Auth.js `requireRole`; `src/proxy.ts` (renamed from `src/middleware.ts` in L1, D-3) is a coarse cookie-presence check only, by design.
- **Customer:** `/account` with pay-outstanding, pause/resume/cancel, marketing preference, property edit (write-only encrypted access codes).
- Owner seeded as `mcsecocleaning@gmail.com`.

### Pre-Phase-3 gate — on the working branch, not on `main`
Six commits: Stripe fixes for flags 1, 2, 3 and 6 plus the flag 4/5 decisions; `b7fb131` explicit "no payment link was created" (`src/lib/admin-booking.ts`); `2cfdf3d` docs. Migrations #7–#9 (`2026-09-30-*`). **Neon:** Fola created the project (London), a `gate` branch and a `psql` connection (PG 18.6), and was setting Vercel env vars. Nothing after that is recorded, and none of it is reachable from this machine — see Q-6.

---

## Environment readiness — **ready for L2** (15 Oct 2026)

| | |
| --- | --- |
| `.env.local` | Present and git-ignored (`git check-ignore` confirms). All nine L2 keys now carry real values; `MEDIA_LINK_SECRET` is generated too. Checked by name and prefix only |
| `.env` | Removed 15 Oct 2026 per `SETUP.md` §4, once `.env.local` existed — it carried the retired `ADMIN_ACCESS_CODE` and the `user:password@localhost` placeholder that `SETUP.md` §1 warns would fight the dev-database guard (and, via `prisma.config.ts`, could have aimed a migration at the wrong target — see R-1). Backed up outside the repo first, since `.env*` is git-ignored |
| Neon `dev` branch | **Reachable.** `psql "$DIRECT_URL"` connects as `neondb_owner` to `neondb` on PostgreSQL 18.6; `public` holds 0 tables, so L2 baselines a clean database |
| Stripe | **Test mode.** `sk_test_` / `pk_test_` prefixes verified. No live key is present anywhere in the environment. `STRIPE_WEBHOOK_SECRET` is supplied per session by `stripe listen`, per `SETUP.md` §3.3 |
| `.claude/settings.json` | Created 8 Oct 2026 from `SETUP.md` §5 so the build can run unattended. L1 validates it |

### Keys present (names only, updated each session)

| Stage | Needs | Present? |
| --- | --- | --- |
| L1 | none | ✅ n/a |
| L2 | `DATABASE_URL`, `DIRECT_URL`, `DEV_DB_HOST`, `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `DEV_EMAIL_REDIRECT` | ✅ **9 of 9 (15 Oct 2026)** — per-key detail under **✅ Stop cleared**. `STRIPE_WEBHOOK_SECRET` comes from `stripe listen` per session, not from the file |
| L7 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_LINK_SECRET` | ⚠️ 2 of 5 — `R2_BUCKET` default and `MEDIA_LINK_SECRET` generated 15 Oct; the three Cloudflare credentials empty |
| L9 | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_ID` | ⚠️ 1 of 3 — `TWILIO_SENDER_ID` default `mcseco`; the two credentials and `DEV_SMS_REDIRECT` empty |
| L11 | Stripe Bacs enabled (test), `NEXT_PUBLIC_CALCOM_URL` | ❌ none |
| L12 | `GOOGLE_REVIEW_URL` | ❌ none |
| L14 | `NEXT_PUBLIC_SENTRY_DSN`; Upstash optional | ❌ none |

---

## External review — 9 Oct 2026

An outside review (Claude, in Fola's planning project) cloned `build/autonomous` at `77852e5` from GitHub and checked it against the documents. Nothing in the code was changed. The documents were revised to PRD v2.2.1; this section records what was found.

**Verify gate, re-run in the review sandbox:** lint clean; unit tests 179 of 181 pass. The 2 failing test files (`src/lib/discounts.test.ts`, `src/lib/payments.test.ts`) and every typecheck error trace to one cause: the sandbox could not download Prisma's engine (`binaries.prisma.sh` unreachable), so `@prisma/client` was never generated and its enums and types were missing. That is the sandbox, not the code. The L1 evidence (190 tests, typecheck clean) is not contradicted — but it was not independently reproduced either. L2's first gate run on Fola's Mac is the real confirmation.

**Findings — now L2 work (PRD §16.1 has the detail):**

1. **Recurring bookings create no `Subscription`.** `createBooking` (`src/app/actions/booking.ts` ~L370) writes one `Job` with the frequency only in `notes`; nothing in `src/` creates a `Subscription` (`adminCreateBooking` likewise). The materialiser and the customer pause/resume/cancel actions have nothing to act on.
2. **No collection once a card hold lapses.** Holds last ~7 days; `bookingHorizonDays` is 21 (`src/config/availability.ts`); the deposit saves the card `on_session` only and `src/lib/stripe.ts` says nothing charges a saved card later; materialised recurring jobs are `paymentStatus: "pending"` with no charge path. Contradicts PRD §8 "card on file, charged off-session per visit". Mechanism → SETUP D7 / Q-10.
3. **`prepareOutstandingCheckoutForVerifiedJob`** is exported from the `"use server"` module `src/app/actions/payments.ts` with no auth check, and returns a Checkout URL plus the customer's name and email for any job id. Fix and a guard test are L2 items.

**Smaller findings:**

- Quote validity: PRD §7.2 says 14 days; `createBooking` stores 30 (`src/app/actions/booking.ts:362`) → Q-11.
- `.env.example` pre-fills `MEDIA_RETENTION_MONTHS="12"` while SETUP D4 is blank → Q-12.
- PRD L3 said "cash-as-admin-exception"; the code (`src/app/actions/admin.ts`), PRD §12.5 and `CLAUDE.md` all forbid cash. The PRD text was corrected in v2.2.1 (§9.7, L3); no code change.
- This file's Phase 2 summary still named `src/middleware.ts`; corrected to `src/proxy.ts`.

**Checked and consistent:** `main` = `2f667ff`; `build/autonomous` carries the fix-branch commits (`6a1c1c7` … `2cfdf3d`) plus L1 (`bb88059`, `408a5af`, `0f5a457`, `77852e5`); 9 manual migrations present; `requireRole` on every `/admin` page and on every admin/payment action except finding 3; no cash path; the dev-db and outbound guards exist as described.

---

## Gaps found, assigned to stages

Re-measured on 8 Oct 2026. Three entries that the earlier snapshot got wrong are marked **corrected**.

- **L1 — trust claims nobody has confirmed, hardcoded in six files.** "£5m public liability", "DBS-checked" and "Fully insured" appear in `src/app/page.tsx` (trust badges, how-it-works step, FAQ answer), `src/app/about/page.tsx`, `src/components/ui/TrustBar.tsx`, `src/components/layout/Footer.tsx`, `src/config/services.ts` and `src/app/opengraph-image.tsx`. Only `publicLiabilityCover` reads config (`src/config/site.ts`), and that value is a `PLACEHOLDER`. Routing them through config is a prerequisite to gating them.
- **L1 — stale config.** `.env.example` still lists the retired `ADMIN_ACCESS_CODE` (no code reads it since Auth.js) and lacks `APP_ENV`, `AUTH_SECRET`, `DEV_DB_HOST`, `DEV_EMAIL_REDIRECT`, `DEV_SMS_REDIRECT`, `MEDIA_LINK_SECRET`, `NEXT_PUBLIC_ALLOW_INDEXING`. (`README.md` was corrected on 8 Oct — status line and the links to the archived PRD and `BUILD-STATUS.md`.)
- **L1 — business-input markers**: 26 `PLACEHOLDER`, 2 `TODO(business-input)`, 2 `TODO(ops)`, 0 `TODO(pricing)`, 0 `TODO(legal)`, across `src/config/site.ts`, `src/config/availability.ts`, `src/lib/capacity.ts`, `src/lib/pricing/rate-card.ts`, `src/app/cancellation-policy/page.tsx`. `npm run check:launch-inputs` (L1) must find these five files.
- **L2 — recurring booking → `Subscription` (added 9 Oct).** See *External review*, finding 1.
- **L2 — collection beyond the card hold (added 9 Oct).** Finding 2; mechanism parked on Q-10 / SETUP D7.
- **L2 — unauthenticated server action (added 9 Oct).** Finding 3; plus a test that every `src/app/actions/*` export makes an auth decision or is on the public allow-list.
- **L4 — capacity is config-backed, but the engine is ready.** **Corrected:** `src/lib/capacity.ts` is already a pure function taking `crews: CrewAvailability[]` and `existingJobs: ExistingJob[]`. L4 is a loader, not a rewrite.
- **L4 — `JobAssignment`** has `isLead`/`assignedAt` only; no `offeredAt`/`acceptedAt`/`declinedAt`.
- **L4 — `CrewProfile`.** **Corrected:** it *does* have `dbsCheckedAt`. Missing are `dbsExpiresAt` and `insuranceExpiresAt`.
- **L6 — access codes are further along than the stage title suggests.** **Corrected:** AES-256-GCM encrypt/decrypt, the reveal window and `canRevealAccessCode` are built and tested in `src/lib/access-codes.ts`; `Property.accessCodeEncrypted`/`alarmCodeEncrypted` and `AccessCodeAudit` are in the schema. What is missing is the crew reveal surface and **refusal logging** — `recordAccessCodeView` writes only on success, so `AccessCodeAudit` cannot distinguish a reveal from a refusal. Needs an `outcome` field.
- **L12** — schema has no `Review.wasIncentivised`/`incentiveDisclosed`, no `Job.isPromotional`, no `Quote.abandonedAt`/`recoveryEmailSentAt`.
- **Post-launch** — schema still uses `AIInsight`, not `AgentAction` (PRD §16.4).

### Deferred items carried forward
- Payment-link copy/reissue on `/admin/jobs` → **L2**.
- Cross-session payment resume page → deferred (the deposit nudge covers it).
- GDPR erasure as anonymise/soft-delete → **L13**.
- Rate-card editor (Task 5) → **L10**, subject to SETUP D3.

---

## Open questions for Fola

Format: **Q-n** · stage · question · options (none picked) · what's blocked.

- **Q-6** · L2 · ~~**`.env.local` does not exist on this machine.**~~ **Resolved 15 Oct 2026.** `.env.local` exists and all nine L2 keys carry real values; Stripe is in test mode and the dev-db guard confirms its target. L2 is unblocked and running. The original question, for the record: `SETUP.md` §3 had not been completed on this machine, so there was no Neon `dev` connection string, no `DEV_DB_HOST`, no Stripe test key and no `AUTH_SECRET`, which blocked L2 and transitively L3–L15.

- **Q-1** · all · Eco positioning weight (PRD §16.7 #1, SETUP D6). Options: primary from day one / phase-two differentiator. Blocks: nothing in code; affects copy emphasis.
- **Q-2** · L4 · ~~Employee or self-employed crews (SETUP D2).~~ **Answered 8 Oct 2026: not decided — build both.** L4 builds and tests `assign` and `offer`; the production config value is chosen before launch. The underlying employment-status question (PRD §14.6, §16.7 #2) still affects the cost floor and so Q-4.
- **Q-3** · L1 · Trust facts: are crews DBS-checked, and what public liability cover is actually held, with which insurer? Until confirmed, L1 hides both claims across all seven files. Blocks: nothing; the claims simply stay hidden. Note the site currently asserts both to the public.
- **Q-8** · L1 · **The T&Cs assert insurance we have not confirmed.** `src/app/terms/page.tsx` §7 reads "We carry public liability and, where relevant, treatment/care-custody-and-control and employers' liability insurance." L1 gated the same claim everywhere else, but changing legal wording is a Park item (`CLAUDE.md` → *Decision boundary*), so this was left alone and exempted from the claim scan. Options: confirm the cover and the sentence stands / amend the wording with an adviser / remove §7 until confirmed. Blocks: nothing in code. **This is live on the site today.**
- **Q-9** · launch · **`VAT_DISPLAY_MODE` has never been chosen.** `src/lib/money.ts` defaults to `"absorb"` when unset, so today every published price stays put on VAT registration and the VAT comes out of margin. The alternative, `"add"`, treats rate-card figures as net and raises every headline price by the VAT rate. L1 documented the variable in `.env.example` without changing the default. Options: absorb / add. Blocks: nothing now; it changes every consumer price the day `VAT_REGISTERED` flips, so decide it with Q-4.
- **Q-4** · launch · Cost-per-crew-hour model (§16.7 #8) may change rate-card figures. Blocks: launch pricing sign-off only.
- **Q-5** · launch · Company facts for `src/config/site.ts` (SETUP §6) — 26 placeholders. Blocks: the L15 release gate (`npm run check:launch-inputs`).

- **Q-10** · L2 · ~~**How to collect payment once a card hold lapses.**~~ **Answered 15 Oct 2026 — SETUP D7 = A** (`f554149`): save the card at booking and charge it off-session on completion for any booking more than ~6 days ahead and for every recurring visit. B (place the hold ~2 days before each job) and C (cap one-off bookings at ~6 days ahead) are both unticked, so `bookingHorizonDays` stays at 21 and no scheduled pre-authorisation task is built. L2 builds mechanism A with the failure-path tests the stage requires. One piece of it is parked separately: the customer-facing wording for agreeing to a card on file is legal wording, drafted but not shipped — **Q-14**.

- **Q-11** · L2 · **Quote validity period.** PRD §7.2 says 14 days; the code stores 30 (`src/app/actions/booking.ts:362`). Options: change the code to 14 / amend the PRD to 30. Blocks: nothing; it sets how long a quoted price is honoured.
- **Q-13** · all · ~~**Where the five build documents live.**~~ **Resolved 15 Oct 2026 — option (a):** Fola moved the five back to the repo root in `31fa69d`, keeping the v2.2.1 content, so `CLAUDE.md` auto-loads again and matches its own line 24. `31fa69d` moved the five files only, so `README.md`'s three links were left pointing at `docs/` and were broken by the move; repointed at the root in the same commit as this entry. The original question, for the record: They were moved into `docs/` on 9 Oct 2026 along with the v2.2.1 revision, but `CLAUDE.md` itself still states (line 24) that the five live at the **repo root**, and decision D-0a records why: *Claude Code only auto-reads `CLAUDE.md` from the repo root*. That is not theoretical — this session was **not** given `CLAUDE.md` automatically and had to be pointed at `docs/CLAUDE.md` by hand. A future session started without that instruction runs with no rulebook and would not know it. The agent may not edit `CLAUDE.md`, so the contradiction is parked rather than resolved. Options: **(a)** move the five back to the repo root, keeping the v2.2.1 content — restores auto-loading and matches `CLAUDE.md` as written; **(b)** keep them in `docs/` and amend `CLAUDE.md` line 24 and D-0a, accepting that every future session must be told where the rulebook is. `README.md`'s links were repointed at `docs/` so the repo is at least self-consistent today; under option (a) that is one edit back. Blocks: nothing in code — but it decides whether the next unattended session reads the rules at all.
- **Q-12** · L7 · **Media retention.** `.env.example` pre-fills `MEDIA_RETENTION_MONTHS="12"` while SETUP D4 is blank, so L7 would ship 12 months by default. Options: 12 / 18 / 24 months (answer D4). L7 reads D4, not the example default; until D4 is answered the retention value is parked. Blocks: L7 retention only.

- **Q-14** · L2 · **Card-on-file consent and pre-contract wording (legal).** D7 = A means the customer's card is saved at booking and charged automatically later, which changes what they agree to at checkout. `CLAUDE.md` makes legal wording a Park item, so the mechanism is built behind a confirmed-wording flag and the draft sits in `src/config/legal.ts` marked `TODO(legal)`; nothing new is shown to a customer until Fola approves it. Options: approve the draft as written / amend it with an adviser / have the wording drafted against the CCR and Stripe's mandate requirements before any off-session charge is enabled. Blocks: switching mechanism A on for real customers (it is exercised by tests and in dev only). **This is the one L2 item that needs Fola.**

## Review queue (Fola reviews at merge checkpoints)

Format: **R-n** · stage · file(s) · what changed · why · data-safety note (migrations).

Per SETUP D1 = A these were built, tested and committed; they wait for Fola at **merge checkpoint 1**, after L2.

- **R-1** · L1 · `prisma.config.ts`, `package.json` · The `package.json#prisma` block moved to `prisma.config.ts` to clear a Prisma 7 deprecation. **Read this one before L2 runs any migration:** a Prisma config file makes Prisma stop loading `.env` itself, so the new file loads it explicitly, and it loads `.env.local` *before* `.env` because `process.loadEnvFile` never overwrites an already-set name. The obvious order would let the stale `.env` placeholder win and point migrations at `localhost`. *Data-safety:* no schema change; this only determines **which database** a migration reaches, which is why it is here.
- **R-2** · L1 · `scripts/assert-dev-db.ts`, `prisma/seed.ts`, `package.json` · New deny-by-default guard on every migrate, push, reset, deploy and seed: refuses unless the connection host equals `DEV_DB_HOST`, normalising Neon's pooled host against the direct one. Also called inside `prisma/seed.ts`, because `prisma db seed` goes through `prisma.config.ts` and never touches the npm script. `db:deploy` is guarded too, so `LAUNCH.md` will give the direct `npx prisma migrate deploy` command instead. *Data-safety:* this guard only ever refuses; it cannot cause a write.
- **R-3** · L1 · `src/config/site.ts`, `src/lib/trust.ts` + 7 surfaces · Public copy changed: four factual claims are withheld until confirmed. Worth your eyes because it is what customers now read. Reversing it is one edit — set `confirmed: true` on a claim in `src/config/site.ts` and it reappears everywhere.

## Decisions made (by Claude Code)

Format: **D-n** · stage · decision · why · alternative · how to reverse.

**SETUP §1 answers on record (8 Oct 2026):** D1 = **A**, batch review at the five merge checkpoints — schema, pricing-logic, payment and auth changes are built, tested, committed and listed under *Review queue*; they do **not** halt the build. D2 = **not decided**, build both assignment modes. D3–D6 remain blank and are parked per `CLAUDE.md` → *Park it and keep going*.

Decisions taken during the 8 Oct reconciliation, before the autonomous run:

- **D-0a** · pre-L1 · The five build documents (`CLAUDE.md`, `PRD.md`, `PROGRESS.md`, `SETUP.md`, `CLAUDE_CODE_PROMPT.md`) live at the **repo root**, not `docs/`. Why: Claude Code only auto-reads `CLAUDE.md` from the root, and `PRD.md` declares itself a root file. Alternative: keep them in `docs/` and symlink — rejected as fragile. Reverse: move them back and fix the cross-references.
- **D-0b** · pre-L1 · `docs/DEPLOYMENT.md` and `docs/PHASE-0-CHECKLIST.md` **restored** after being deleted. Why: PRD L2 cites `docs/DEPLOYMENT.md` §4a for the per-migration run notes and §4b for the Stripe gates A/B/C, and L15 builds `LAUNCH.md` from it; `PHASE-0-CHECKLIST.md` is cited by `SETUP.md` §6. Deleting them would have left L2 without its runbook. Reverse: delete again once `LAUNCH.md` supersedes them at L15.
- **D-0c** · pre-L1 · The superseded PRD v2.1, the v2.1 task briefs and `BUILD-STATUS.md` moved to `docs/archive/` with a README, rather than deleted. Why: code comments cite v2.0/v2.1 section numbers and §17.6's map is easier to trust with the source to hand. Reverse: `rm -r docs/archive`.
- **D-0d** · pre-L1 · `.claude/settings.json` created from `SETUP.md` §5. Why: without it the run stops for a permission prompt on every command, which defeats unattended operation. Alternative: `--dangerously-skip-permissions` — rejected, the allow-list is the safer default. Reverse: delete the file.

Decisions taken during L1:

- **D-1** · L1 · Trust claims are **withheld, not softened**, and a surface that exists only to carry one is removed entirely — the About "Insured & vetted" card and the homepage "Are you insured and vetted?" FAQ disappear rather than being reworded. Why: there is no honest weaker form of "our crews are DBS-checked", and a vague reassurance in the same slot is the same claim with deniability. Removing the FAQ entry also drops it from the FAQ JSON-LD, so the structured data cannot advertise a question the page no longer answers. Alternative: keep the slots with generic copy — rejected as padding (§12.4). Reverse: set `confirmed: true` on the claim in `src/config/site.ts`; every surface returns.
- **D-2** · L1 · A **source scan** in `src/lib/trust.test.ts` fails the suite if a claim string is written inline in `src/app`, `src/components` or `src/config`. Why: the gate decays the first time someone types "DBS-checked" into a component, which is exactly how the original problem arose. `src/app/terms/page.tsx` is exempted (legal wording, Q-8) with the reason in the test. Alternative: trust review — rejected. Reverse: delete the test.
- **D-3** · L1 · `src/middleware.ts` → `src/proxy.ts` with the function renamed `proxy`. Why: Next 16 renamed the convention and `next build` warns; behaviour is identical (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). Reverse: rename back.
- **D-4** · L1 · `package.json#prisma` → `prisma.config.ts`, **and that file loads env vars itself, `.env.local` first**. Why: the config file is required for Prisma 7, but creating it makes Prisma print "skipping environment variable loading" and stop reading `.env` — proven by disabling the loader, which produced `P1012: Environment variable not found: DIRECT_URL`. `process.loadEnvFile` never overwrites an already-set name, so the intuitive `.env` → `.env.local` order would let the stale placeholder win. Alternative: add `dotenv` — rejected, Node's built-in does it with no new dependency. Reverse: delete `prisma.config.ts` and restore the `package.json` block.
- **D-5** · L1 · The dev-db guard is called **inside `prisma/seed.ts`** as well as from the npm scripts. Why: `prisma db seed` runs the seed command from `prisma.config.ts` directly and never passes through `npm run db:seed`, so the script-level guard alone leaves a hole. Reverse: drop the `assertDevDatabase()` call.
- **D-6** · L1 · `db:deploy` is guarded too, so it can only ever reach the dev database. Why: it is the one `db:*` script whose purpose is production, and the agent must not be able to run it against one. Consequence: `LAUNCH.md` (L15) must give Fola the direct `npx prisma migrate deploy` command rather than the npm script — noted here so L15 does not forget. Reverse: remove the guard from that one script.
- **D-7** · L1 · Neon's **pooled host is normalised** against the direct host before comparison (`-pooler` stripped). Why: `SETUP.md` has Fola copy the *direct* host into `DEV_DB_HOST` while `DATABASE_URL` is the *pooled* string, so a literal comparison would refuse every legitimate command — and a guard that blocks normal work gets switched off. Reverse: compare literally and document that `DEV_DB_HOST` must be the pooled host.
- **D-8** · L1 · `npm test` now globs `scripts/**/*.test.ts` as well as `src/**/*.test.ts`. Why: the dev-db guard lives in `scripts/` and its tests must run in the gate. Reverse: move the guard under `src/lib/`.
- **D-9** · L1 · No new dependency was added. `process.loadEnvFile` replaced `dotenv`, and the launch-inputs check and claim scan use `node:fs` rather than a glob library. (`CLAUDE.md` requires a justification per dependency; the justification here is that none was needed.)
- **D-10** · L1 · `VAT_DISPLAY_MODE` is **documented** in `.env.example` with its current default (`absorb`), not changed. Why: it is read by `src/lib/money.ts` and silently governs whether VAT registration moves every headline price, but choosing the mode is a business decision — parked as Q-9.

## Checkpoint merge notes

Checkpoint 1 falls after **L2**, so these notes are incomplete until L2 runs. What is already known:

**Migrations Fola must apply before merging** — none from L1. L1 added no schema change. L2 will apply migrations #1–#9 to the Neon `dev` branch; whatever Vercel Production points at needs the same nine, in filename order, **before** the merge deploys (migrate-before-swap, `docs/DEPLOYMENT.md` §4a). The two `ALTER TYPE … ADD VALUE` files run standalone, without `-1`.

**New Production env var names from L1** — `APP_ENV` (must be exactly `production` in the Production scope, or the site will redirect its own customer email to a dev inbox), and `VAT_DISPLAY_MODE` if Q-9 is answered `add`. `DEV_DB_HOST`, `DEV_EMAIL_REDIRECT` and `DEV_SMS_REDIRECT` are dev-only and must **not** be set in Production.

**Review-queue items in scope:** R-1, R-2, R-3 above.

**One behaviour change to expect:** `npm run db:deploy` now refuses anything that is not the dev database (D-6). The production migration command for `LAUNCH.md` is `npx prisma migrate deploy` directly.

---

## Stage logs

Each stage gets: **Plan** (a checklist written before coding) · **Work** (items ticked with commit hashes) · **Evidence** (trimmed real output for each acceptance criterion) · **Notes**.

### L1 — Reconcile and guardrails

**Plan** (written 8 Oct 2026 before coding):

- [x] **L1.1** Create `build/autonomous`. `fix/pre-phase3-gate` is **not** merged into `main`, so the branch is cut from its head `2cfdf3d`.
- [x] **L1.2** Baseline verified against the branch; documentation reconciled (archive, restores, root move, README). Commit `bb88059`.
- [ ] **L1.3** Trust-claim gate. Route the hardcoded claims in six files through `src/config/site.ts`; add a `confirmed` flag per claim (default `false`); render a claim only when confirmed; guarantee and eco badges fill the space (§12.4). Test asserts no unconfirmed claim reaches rendered output.
- [ ] **L1.4** `.env.example`: drop the retired `ADMIN_ACCESS_CODE`; add `APP_ENV`, `AUTH_SECRET`, `DEV_DB_HOST`, `DEV_EMAIL_REDIRECT`, `DEV_SMS_REDIRECT`, `MEDIA_LINK_SECRET`, `NEXT_PUBLIC_ALLOW_INDEXING`, `MEDIA_RETENTION_MONTHS`.
- [ ] **L1.5** Guard 1 — `scripts/assert-dev-db.ts`: refuses any migrate/reset/seed unless the resolved database host equals `DEV_DB_HOST`. Pure decision function + tests; wired into `db:push`/`db:migrate`/`db:seed`.
- [ ] **L1.6** Guard 2 — non-production outbound: when `APP_ENV !== "production"`, every email goes to `DEV_EMAIL_REDIRECT` and every SMS to the log or `DEV_SMS_REDIRECT`. Pure decision function + tests; wired into `src/lib/email.ts`.
- [ ] **L1.7** `npm run check:launch-inputs` — lists every `TODO(business-input)`, `TODO(pricing)`, `TODO(legal)`, `TODO(ops)` and `PLACEHOLDER` in `src/`, exits non-zero if any remain. Wired into the L15 release gate, not into `npm run build`.
- [ ] **L1.8** Clear any Next 16 deprecation warnings `next build` prints.
- [ ] **L1.9** Validate `.claude/settings.json` and `.env.example` against `SETUP.md`; refresh the *Keys present* table.
- [ ] **L1.10** Full gate green on `build/autonomous`; `PROGRESS.md` matches the repo; push.

**Acceptance (PRD §16.3):** `PROGRESS.md` matches the repo · both guards exist and are tested · full suite green · no product behaviour changed *except* the trust-claim gate, which is L1's stated purpose and removes unverified public claims.

**Work:**

- `bb88059` — documents to the repo root, baseline reconciled, superseded specs archived (L1.1, L1.2).
- `408a5af` — trust-claim gate, both guards, launch-inputs check, Next 16 / Prisma 7 deprecations (L1.3, L1.5–L1.8).
- This commit — `.env.example` rewrite, `VAT_DISPLAY_MODE` documented, settings and key validation (L1.4, L1.9, L1.10).

**Evidence:**

Full gate on `build/autonomous`:

```
$ npm run typecheck          # tsc --noEmit
(no output — clean)

$ npm run lint               # eslint
(no output — clean)

$ npm test
ℹ tests 190
ℹ suites 17
ℹ pass 190
ℹ fail 0
ℹ duration_ms 290.401541

$ npm run build
✓ price parity: every 'from' surface matches the rate card
✓ Compiled successfully
(no deprecation warnings — both were cleared in L1.8)
```

Guard 1 — dev database refuses by default, and matches the pooled host against the direct one:

```
$ npx tsx scripts/assert-dev-db.ts
✗ Refused — not the dev database.
  DEV_DB_HOST is not set, so this command cannot be proven to target the dev
  database. Set it to the Neon dev branch's DIRECT host (SETUP.md §3.1, step 3).
  Refusing by default.
  → exit 1

$ DATABASE_URL=…ep-test-1234-pooler.…  DIRECT_URL=…ep-test-1234.…  \
  DEV_DB_HOST=ep-test-1234.c-2.eu-west-2.aws.neon.tech  npx tsx scripts/assert-dev-db.ts
✓ dev database confirmed (ep-test-1234.c-2.eu-west-2.aws.neon.tech) — proceeding.
  → exit 0

$ DATABASE_URL=…ep-PROD-9999.…  DEV_DB_HOST=ep-test-1234.…  npx tsx scripts/assert-dev-db.ts
✗ Refused — not the dev database.
  DATABASE_URL points at "ep-prod-9999.c-2.eu-west-2.aws.neon.tech", which is not
  the dev database. Refusing: a migrate or reset against the wrong Neon branch is
  not recoverable.
  → exit 1
```

Guard 2 — outbound. 24 tests in `src/lib/outbound-guard.test.ts`, including one asserting that **no** non-production configuration can put the real address in `to`.

Prisma config env loading — proven necessary, not assumed:

```
$ npx prisma migrate status                       # with the loader
Datasource "db": PostgreSQL database "mcseco", schema "public" at "localhost:5432"

$ npx prisma migrate status                       # loader disabled, as a control
Error code: P1012
error: Environment variable not found: DIRECT_URL.
```

Trust-claim gate — verified in a running browser, not only by unit test. Eight public pages fetched and stripped of markup, scanned for `DBS-checked`, `fully insured`, `£Nm public liability`, `eco-certified`:

```
/ /about /guarantee /end-of-tenancy-cleaning /office-cleaning
/communal-area-cleaning /prices /terms    → all 200, zero matches
```

The homepage FAQ dropped from 4 questions to 3 in both the rendered page and the FAQ JSON-LD; step 2 reads "Our crew arrives with non-toxic products…"; the trust bar renders 4 badges and still reads as a row. Screenshot taken.

Launch inputs (`npm run check:launch-inputs`, new):

```
TODO(business-input) — 5
TODO(ops) — 2
PLACEHOLDER — 28
Unconfirmed trust claims — 4 (withheld from the site, not blocking)
✗ 35 markers outstanding, 4 trust claims unconfirmed.
```

26 of the 28 placeholders are in `src/config/site.ts`; the other 2 are the
rate-card figures awaiting the cost-per-crew-hour model (Q-4). Exits 1, as the
L15 release gate requires.

**Acceptance:** met. `PROGRESS.md` matches the repo; both guards exist, are tested and are wired into every path that could reach a database or a recipient; the full suite is green; no product behaviour changed except the trust-claim gate, which is L1's stated purpose.

**Notes:** two claim sites were found that the baseline had not listed (`src/config/services.ts` communal-area bullet, `src/app/guarantee/page.tsx` damage FAQ), and a third — the T&Cs §7 — was deliberately left alone as legal wording and raised as Q-8. A bug in the connection-string parser (a password containing `/` or `?` returned part of the password as the host) was caught by its own test before the guard was wired in.

---

### Session — 9 Oct 2026 (L2 attempt, stopped)

Asked to resume on `build/autonomous`, read the v2.2.1 revisions, confirm the L2
keys and start L2. **L2 did not start: `.env.local` is still absent** — see
**⛔ STOPPED** at the top of this file for the nine key names and how to clear it.
No application code was touched and no product behaviour changed.

**Session-start checks.**

```
$ git status --short          # before this session's repairs
 D CLAUDE.md  D CLAUDE_CODE_PROMPT.md  D PRD.md  D PROGRESS.md  D README.md
 D SETUP.md   D docs/DEPLOYMENT.md     D docs/PHASE-0-CHECKLIST.md
 D docs/archive/BUILD-STATUS.md  D docs/archive/README.md
 D docs/archive/claude-code-prompt-v2.1-updates.md
 D docs/archive/mcsecocleaning_PRD_v2.1.md
?? docs/CLAUDE.md  ?? docs/CLAUDE_CODE_PROMPT.md  ?? docs/PRD.md
?? docs/PROGRESS.md  ?? docs/SETUP.md

$ git log --oneline -1
77852e5 docs(l1): mark the Baseline table as the fixed pre-L1 reading

$ git branch -vv | grep autonomous
* build/autonomous  77852e5 [origin/build/autonomous]   # in sync with GitHub
```

The tree matched *Next action* (L1 done, L2 not started) once the file moves were
accounted for. `main` is untouched at `2f667ff`.

**Keys.** No `.env.local` at the repo root; `.env` and `.env.example` are the only
env files present, and `.env` is the same stale placeholder set described above
(`NEXT_PUBLIC_SITE_URL`, `VAT_REGISTERED`, `DATABASE_URL`, `DIRECT_URL`,
`ADMIN_ACCESS_CODE` — the last of which L1 retired). All nine L2 keys were also
checked in the shell environment and are unset there too, so there is no
alternative source. No key value was read, printed or logged at any point.

**SETUP D7.** Read, not inferred: options A, B and C are all unticked, so Q-10
stands and L2's gap-2 item parks when L2 does run.

**Verify gate — re-run on Fola's Mac, first independent confirmation of L1.**
The external review could not reproduce L1's evidence because its sandbox could
not download Prisma's engine. That gap is now closed:

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint .
(no output — clean)

$ node --import tsx --test "src/**/*.test.ts" "scripts/**/*.test.ts"
ℹ tests 190
ℹ suites 17
ℹ pass 190
ℹ fail 0
ℹ duration_ms 313.81425

$ npx prisma generate
✔ Generated Prisma Client (v6.19.3) in 96ms

$ npx tsx scripts/check-price-parity.ts
✓ price parity: every 'from' surface matches the rate card

$ npx next build
✓ Compiled successfully in 175ms      # 38 routes, no warnings, no deprecations
```

So L1's 190 tests, clean typecheck and clean build are confirmed on the real
machine. The two test files the review saw fail (`src/lib/discounts.test.ts`,
`src/lib/payments.test.ts`) pass here, which supports the review's own reading
that the failures were its missing Prisma client and not the code. The drift
check is still unrun — it needs `DIRECT_URL`, and it remains L2's first job.

**Working-tree repairs.** Four things had been deleted from the working tree but
were still in `HEAD`, and were restored with `git restore`:

- `docs/DEPLOYMENT.md` — **L2 cannot run without it.** PRD L2 cites §4a for the
  per-migration run notes and §4b for Stripe gates A/B/C; D-0b restored it once
  before, for this reason.
- `docs/PHASE-0-CHECKLIST.md` — cited by `SETUP.md` §6.
- `docs/archive/` (all four files) — provenance for the v2.0/v2.1 section numbers
  that code comments cite, per D-0c.
- `README.md` — its three links pointed at `PRD.md`, `PROGRESS.md` and
  `CLAUDE.md` at the repo root and broke when those files moved into `docs/`.
  Repointed at `docs/`. A repo-wide grep now finds no link to a moved or
  archived path.

**Not done, and why.** Moving the five build documents back to the repo root —
which is what `CLAUDE.md` line 24 and D-0a require — was attempted and refused by
this environment's permission layer. It is Fola's call in any case, so it is
parked as **Q-13** rather than retried. The documents' current location in
`docs/` is committed as-is so the tree is clean.

**Next action:** unchanged — `.env.local`, then delete `.env`, then L2 from its
revised plan in PRD §16.3.

---

### Session — 15 Oct 2026 (L2 attempt, stopped again)

Fola supplied the `SETUP.md` §4 `.env.local` template as a command to run. It was
run; `.env.local` now exists. **L2 still did not start** — the template carries
every externally-issued credential as an empty string, so 7 of the 9 keys L2 needs
are blank. Detail and per-key instructions are in **⛔ STOPPED** at the top.
No application code was touched.

**Session-start checks.**

```
$ ls CLAUDE.md PRD.md PROGRESS.md SETUP.md CLAUDE_CODE_PROMPT.md
all five present at the repo root          # Q-13 resolved, option (a)

$ git log --oneline -2
31fa69d docs: move build documents to repo root (per CLAUDE.md)
b929149 docs: L2 stop — .env.local absent; restore deleted docs, repair links

$ git status --short
(clean)

$ git branch -vv | grep -E "autonomous|main"
* build/autonomous  31fa69d [origin/build/autonomous]
  main              2f667ff [origin/main]            # untouched
```

`⛔ STOPPED` was present and unresolved at session start, so per `CLAUDE.md` →
*Session protocol* the only work done was on the stop itself.

**What was done.**

- [x] `.env.local` created at the repo root from the §4 template. `git check-ignore`
      confirms it is ignored. `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY` and
      `MEDIA_LINK_SECRET` were generated by the template (44 chars each); no key
      value was read, printed or logged at any point.
- [x] Stale `.env` removed, per `SETUP.md` §4 and §1 note 2. It held the retired
      `ADMIN_ACCESS_CODE` and the `user:password@localhost` placeholder. Copied
      outside the repo first, because `.env*` is git-ignored and git could not have
      restored it.
- [x] `README.md` links repointed at the repo root. `31fa69d` moved the five
      documents without touching README, so its three links were left aimed at
      `docs/` and were broken. A repo-wide grep now finds no link to a moved path.
- [x] Q-13 marked resolved; the keys and environment-readiness tables now show
      per-key state rather than "none".

**The dev-db guard was checked against the new file and refuses correctly** — this
is the behaviour that matters most while `DEV_DB_HOST` is blank, because a guard
that read "empty" as "fine" would be worse than no guard:

```
$ npx tsx scripts/assert-dev-db.ts
✗ Refused — not the dev database.
  DEV_DB_HOST is not set, so this command cannot be proven to target the dev
  database. Set it to the Neon dev branch's DIRECT host (SETUP.md §3.1, step 3).
  Refusing by default.
exit: 1
```

**Verify gate — re-run after the environment change, all green.** Worth running
because `DATABASE_URL` went from the `localhost` placeholder to an empty string and
`.env` disappeared, and the app must still render DB-less. `hasDatabase`
(`src/lib/db.ts:18`) is `Boolean(DATABASE_URL && !includes("user:password@localhost"))`,
so an empty string reads as "no database" exactly as the placeholder did:

```
$ npx tsc --noEmit            → clean
$ npx eslint .                → clean
$ node --import tsx --test "src/**/*.test.ts" "scripts/**/*.test.ts"
ℹ tests 190   ℹ pass 190   ℹ fail 0   ℹ duration_ms 384.580625
$ npx prisma generate         → ✔ Generated Prisma Client (v6.19.3) in 81ms
$ npx tsx scripts/check-price-parity.ts
✓ price parity: every 'from' surface matches the rate card
$ npx next build              → ✓ Compiled successfully in 976ms (no warnings)
```

The drift check still cannot run — it needs `DIRECT_URL`. It remains L2's first job.

**SETUP decisions, re-read.** D7 blank (all three boxes unticked) → Q-10 stands and
L2's gap-2 item will park. D3, D4, D5, D6 also still blank → Q-1, Q-12 and the L10
rate-card editor stay parked as already recorded. D1 = A and D2 = build both are
unchanged.

**Next action:** paste the six Neon/Stripe/Resend values plus `DEV_EMAIL_REDIRECT`
into the existing `.env.local`, and answer D7. Then L2 from its revised plan in
PRD §16.3 — baseline `dev`, migrations #1–#9, drift check, seed, Playwright, gates
A/B/C/D and the three Phase 2 gaps.

---

### L2 — Real database and Stripe test-mode gate

**Started 15 Oct 2026.** Depends on L1 (done). Keys: all nine present and verified
(see **✅ Stop cleared**). Stage text: PRD §16.3 → L2, with the three Phase 2 gaps
from §16.1 and gate D. SETUP **D7 = A**, so gap 2 is built, not parked.

#### Plan — written before coding

**2.1 Database baseline and migrations** (`prisma/`, `scripts/`)
- [ ] Baseline `dev` at the schema *before* migration #1: `git show 21c895c:prisma/schema.prisma`
      (`21c895c` is the parent of `f5a7b65`, which added `2026-09-19-service-area-patch-group.sql`)
      → `prisma db push --skip-generate` against that schema. 33 models, no `ServiceArea.patchGroup`.
- [ ] Apply all nine files in `prisma/manual-migrations/` in filename order with
      `psql -v ON_ERROR_STOP=1`. The two `ALTER TYPE … ADD VALUE` files
      (`…lead-converted-quote-and-domestic-sales.sql`, `…payment-status-part-paid.sql`,
      plus `…payment-status-released.sql`) run **without** `-1`; the rest with `-1`.
      Record the per-file result against `docs/DEPLOYMENT.md` §4a.
- [ ] `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`
      prints an **empty** migration. Any drift means a migration is wrong — fix the
      migration and reset `dev`, never hand-fix a row.
- [ ] `npm run db:seed`. Confirm the owner user, service types and areas land.
- [ ] Add `npm run db:migrate:manual` (guarded, idempotent, filename order) so the
      sequence is reproducible rather than a one-off shell session — this is what
      `LAUNCH.md` will reference for the production run.

**2.2 Local stack**
- [ ] `next dev`, the Inngest dev server, and
      `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3000/api/stripe/webhook`,
      whose output sets `STRIPE_WEBHOOK_SECRET` for the session (never pasted into `.env.local`).

**2.3 Playwright and the runbook gates** (`e2e/`, `package.json`)
- [ ] Add Playwright + `npm run test:e2e` (unit tests stay on `node --test` via `tsx`).
      Justify the dependency under *Decisions made*.
- [ ] **Gate A** — large job: deposit + balance on the same card, including a 3DS
      challenge, then capture on completion.
- [ ] **Gate B** — full-amount job: authorise then capture.
- [ ] **Gate C** — cooling-off cancel: balance released, deposit refunded.
- [ ] Failure cases: declined card, expired card, off-session failure on the balance,
      duplicate webhook delivery (same event id replayed), Checkout-Session re-charge
      reconciliation.
- [ ] Assert at each step: `Payment` rows, `Job.paymentStatus` derivation,
      `WebhookEvent` status, audit notes, Stripe object state.

**2.4 Payment-link reissue** (`src/app/admin/jobs`, `src/app/actions/admin.ts`)
- [ ] "Copy payment link" on the `/admin/jobs` row while the saved Checkout Session
      is open; "Reissue" once expired. (Deferred from Phase 2.)

**2.5 Gap 1 — recurring bookings create a `Subscription`** — ✅ done (`85bd8dd`)
- [ ] When frequency ≠ `one_off`, `createBooking` **and** `adminCreateBooking` create a
      `Subscription`: `recurrenceRule` from frequency + the chosen slot's weekday and
      Europe/London start time (via `rrule`), property, service, per-visit
      `pricePerVisitNet`/`vatAmount`/`gross` from the quote's per-visit figures,
      `firstCleanSurchargeApplied`.
- [ ] The booked slot becomes the subscription's first `Job` (`subscriptionId` set, priced
      as the first visit); the materialiser never duplicates it.
- [ ] Test: a Tuesday 09:00 series stays 09:00 London across **both** BST/GMT changes.
- [ ] Any missing field is an additive migration → *Review queue*. No price figure changes.

**2.6 Gap 2 — collection once the hold lapses, mechanism A** — ✅ done (`d2616ed`)
- [ ] Save the card at booking for later off-session use, and charge it on completion for
      any booking more than ~6 days ahead and for every recurring visit.
- [ ] Tests: a one-off booked ≥ 8 days ahead; a large job's balance ≥ 8 days ahead;
      recurring visits 2+.
- [ ] An off-session failure (test card `4000 0027 6000 3184`) falls back to the existing
      re-charge path and flags admin **without touching the job** (schedule ≠ billing).
- [ ] The consent and pre-contract wording this needs is legal wording: draft it, park it
      as **Q-14**, and keep it behind a confirmed flag — do not ship it unapproved.
- [ ] `bookingHorizonDays` stays 21 (that would be D7 option C, which Fola did not tick).

**2.7 Gap 3 — every server action authorises itself** — ✅ done (`deb3773`)
- [ ] Move `prepareOutstandingCheckout` and its "verified job" wrapper into `src/lib/` with
      `import "server-only"`, leaving `payMyOutstanding` (ownership-scoped) and
      `rechargeOutstanding` (role-gated) as the only callable entry points.
- [ ] A test reads every `src/app/actions/*.ts` export and fails unless it calls
      `requireRole` or the customer ownership guard, or is on an explicit public
      allow-list (`getSlots`, `createBooking`, `submitLead`). → *Review queue*.

**2.8 Gate D — recurring booking end to end**
- [ ] Book weekly → exactly one `Subscription` and one first `Job` → run the materialiser
      twice → the series exists with no duplicate first visit → complete visit 2 →
      payment collected per D7 = A.

**2.9 Close the stage**
- [ ] Full verify gate green, including `npm run test:e2e` and an empty drift check.
- [ ] Evidence pasted per acceptance criterion; *Review queue* and *Decisions made* updated.
- [ ] **Checkpoint 1 merge notes** written (migrations in order, new Production env var
      names, review-queue items, a ready-to-paste PR description).

#### Work

**2.1 Database baseline and migrations — ✅ done.**

- [x] Baseline captured as `prisma/baseline/schema.prisma` (`git show 21c895c:prisma/schema.prisma`,
      33 models, no `ServiceArea.patchGroup`) with a header explaining why a current-schema
      `db push` would prove nothing. `npm run db:baseline` applies it.
- [x] `npm run db:migrate:manual` applies all nine files in filename order, `-1` except the
      three `ALTER TYPE … ADD VALUE` files. `scripts/db-migrate-manual.ts` + 9 unit tests.
- [x] `npm run db:drift` — the gate, asserted rather than eyeballed.
- [x] Seeded.

**Evidence.**

```
$ npx tsx scripts/assert-dev-db.ts
✓ dev database confirmed (ep-red-scene-zamnwn4a.c-2.eu-west-2.aws.neon.tech) — proceeding.

$ npm run db:baseline
Prisma schema loaded from prisma/baseline/schema.prisma
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-red-scene-…"
🚀  Your database is now in sync with your Prisma schema. Done in 6.60s

$ npm run db:migrate:manual
Applying 9 manual migration(s) to the dev database, in filename order:
→ #1 2026-09-19-service-area-patch-group.sql          -1 (single transaction)      ✓ applied
→ #2 2026-09-20-lead-converted-quote-and-domestic-sales.sql  no -1 (ADD VALUE)     ✓ applied
→ #3 2026-09-20-quote-manual-override.sql             -1 (single transaction)      ✓ applied
→ #4 2026-09-24-payments-reconciliation-webhook-status.sql   -1                    ✓ applied
→ #5 2026-09-27-payment-status-part-paid.sql          no -1 (ADD VALUE)            ✓ applied
→ #6 2026-09-28-authjs-tables.sql                     -1 (single transaction)      ✓ applied
→ #7 2026-09-30-payment-checkout-session-id.sql       -1 (single transaction)      ✓ applied
→ #8 2026-09-30-payment-status-released.sql           no -1 (ADD VALUE)            ✓ applied
→ #9 2026-09-30-user-stripe-customer-id.sql           -1 (single transaction)      ✓ applied

$ npm run db:drift      # THE gate — the nine migrations and schema.prisma agree
-- This is an empty migration.
✓ no drift — the dev database matches prisma/schema.prisma.

$ npm run db:seed
✓ dev database confirmed (ep-red-scene-…) — proceeding.
Seed complete.

$ psql "$DIRECT_URL" -At -c "…"      # what landed
36 tables · User:1 (owner) · ServiceType:6 · ServiceArea:18 · AddOn:20 · LocationPage:2
PaymentStatus enum: pending, authorised, part_paid, captured, released, failed, refunded
```

`ServiceArea` holding 18 rows for 10 area slugs is correct, not duplication: the unique
key is `postcodeDistrict`, and one area spans several districts (Kensington & Chelsea has
seven). Re-running the seed leaves the counts unchanged, so the upserts are idempotent.

**Two things the run itself found** — neither visible until there was a database:

1. **`prisma/seed.ts` could never have run through `npm run db:seed`.** L1 added the guard
   call inside the seed (D-5) but the seed loads no env file, and `npm run db:seed` runs
   `tsx prisma/seed.ts` as its own process, which does not pass through `prisma.config.ts`.
   So `DEV_DB_HOST` and `DATABASE_URL` were both unset there: the guard refused, correctly,
   and the seed could not run at all. Fixed by `scripts/load-env.ts`, a side-effect module
   imported first (`.env.local` then `.env`, the order and reason documented in R-1).
   It is a module rather than a few inline lines because ES imports are evaluated before
   the importing file's body, so inline loading reads in the right order without running
   in it. `scripts/db-migrate-manual.ts` and `scripts/check-drift.ts` use it too.
2. **Four of the nine migrations are one-shot** (`CREATE TYPE` / `CREATE TABLE` unguarded):
   #1, #3, #4 and #6. They are left exactly as they are — they may already have been applied
   to Fola's Neon `gate` branch, and editing SQL that has run somewhere is how a database and
   its migration set quietly stop matching. Instead the split is pinned by a test, so the
   supported sequence stays *baseline once, then apply once*: the L2 fix loop resets `dev` to
   the baseline and re-runs the whole set rather than re-running it over a migrated database.

```
$ npx tsc --noEmit        (clean)      $ npx eslint .            (clean)
$ npm test                ℹ tests 203  ℹ pass 203  ℹ fail 0      # 190 → 203 (+13)
$ npm run build           ✓ 38 routes — first build against a real database
```

**2.7 Gap 3 — every server action authorises itself — ✅ done (`deb3773`).**

`prepareOutstandingCheckoutForVerifiedJob` was exported from the `"use server"`
payments module with no auth check. Its *name* was the only thing standing between
any job id and a live Stripe Checkout URL plus the customer's name and email. The
core moved to `src/lib/outstanding.ts` with `import "server-only"`, so it is not an
action and cannot reach a client bundle; `payMyOutstanding` (ownership-scoped) and
`rechargeOutstanding` (role-gated) are unchanged and are now the only entry points.

`src/app/actions/actions-authorise.test.ts` is what stops the next one appearing: it
scans every export of every action module and fails unless it calls `requireRole` or
`requireCustomer`, or is allow-listed with a written reason. **Verified by breaking it
on purpose** — an unguarded export was added and the scan failed on it:

```
$ npx tsx --test src/app/actions/actions-authorise.test.ts     # with a deliberate leak
✖ payments.ts → leakyAction
  leakyAction is an export of a "use server" module, so the client can call it with
  any argument. It calls neither requireRole( nor requireCustomer(. …

$ npx tsx --test src/app/actions/actions-authorise.test.ts     # leak removed
ℹ tests 18   ℹ pass 18   ℹ fail 0      # 15 actions + 3 structural assertions
```

**2.5 Gap 1 — recurring bookings create a `Subscription` — ✅ done (`85bd8dd`).**

Both booking paths now go through `src/lib/subscriptions.ts`; the booked slot becomes
the series' first `Job` with `subscriptionId` set, so pause / resume / cancel in the
customer account have a real row and the materialiser has something to generate from.
Rule derivation is pure and tested (`src/lib/subscription-rule.ts`).

```
$ npx tsx --test src/lib/subscription-rule.test.ts
ℹ tests 14   ℹ pass 14   ℹ fail 0
  ✔ GMT begins (25 Oct 2026): every visit stays Tuesday 09:00 London
  ✔ BST begins (29 Mar 2027): every visit stays Tuesday 09:00 London
  ✔ the booked slot is itself the first occurrence of its own series
  ✔ a fortnightly series keeps the booked week's parity
```

The weekday is read from the **London** calendar, not the `Date`: a 00:30 BST Tuesday
slot is 23:30 Monday in UTC, and reading the instant directly would have booked the
whole series a day early. The DST tests assert the UTC hour *does* shift (08:00Z ↔
09:00Z) while the London wall-clock time does not — a series that holds 09:00 by
accident of a fixed offset would pass a weaker test.

**Two corrections in the materialiser**, whose behaviour had never been exercised
because no `Subscription` ever existed:

1. It anchors on the first **visit**, not `createdAt`. For a fortnightly booking made
   in a different week from its first visit, anchoring on the creation date puts the
   series on the opposite week — so the booked visit is not in the generated set, it
   survives, *and* a near-duplicate appears beside it. That is precisely the duplicate
   gate D exists to catch.
2. Materialised visits are priced from the `Subscription` row, not from a fresh
   `computeQuote`. `computeQuote` reads the live rate card, so the old code would have
   repriced every existing subscription the day a rate changed — which `CLAUDE.md` →
   *Money rules* forbids. Duration still comes from the quote, since duration is not a
   price.

**2.6 Gap 2 — card on file (D7 = A) — ✅ done (`d2616ed`), and OFF by default.**

Mechanism A is built end to end: the card is saved at booking and charged off-session
on completion for any booking more than ~6 days ahead and for every recurring visit.
The boundary is 6 days, not 7 — a job exactly 7 days out would be captured against an
authorisation expiring the same day.

- a large job's deposit now saves the card `off_session` and its balance is **not**
  authorised at booking (the hold would lapse first);
- a job with no deposit confirms a **SetupIntent**, so any 3-D Secure challenge happens
  while the customer is present rather than failing a charge later;
- a recurring visit has no `Payment` row until it completes (the materialiser creates
  jobs and nothing else), so the row is created at completion from the job's stored
  price and charged;
- a failure marks the row `failed`, writes the reason into `JobStatusEvent` and leaves
  the job **completed** — schedule ≠ billing. `authentication_required` is reported
  separately from a decline, because the customer *can* still pay and an admin told
  "declined" would chase a new card for nothing.
- `User.stripeDefaultPaymentMethodId` (additive migration #10, applied, drift still
  empty) is written **only** by the signed webhook — never from the client, and it
  holds a Stripe `pm_…` handle, never card data.

**It does not ship switched on.** Saving a card to charge later changes what the
customer agrees to at checkout, and that is legal wording — a Park item. So
`CARD_ON_FILE_CONSENT.confirmed` is `false` and every booking keeps the old behaviour,
holes included, until Fola approves the draft (**Q-14**). Outside production
`CARD_ON_FILE_DEV_PREVIEW=true` exercises it for the gates; in production the consent
flag is the only switch, which is asserted by a test. The draft carries `TODO(legal)`,
so the L15 launch gate reports it:

```
$ npm run check:launch-inputs
TODO(legal) — 2
  src/config/legal.ts (2)
    48: /** TODO(legal) — draft wording, unapproved. Do not render while unconfirmed. */
```

```
$ npm test
ℹ tests 257   ℹ pass 257   ℹ fail 0      # 203 → 257 (+54 across gaps 1–3)
$ npx tsc --noEmit  (clean)   $ npx eslint .  (clean)   $ npm run build  ✓ 38 routes
$ npm run db:drift  -- This is an empty migration.   ✓ no drift
```

