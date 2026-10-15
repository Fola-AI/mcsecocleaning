# PROGRESS.md — mcsecocleaning build log

> **For Fola:** this is the one file to check. The top section shows where things stand and whether anything needs you. **For Claude Code:** this is the only status file you write. Update it after every completed item.

## ✅ Stop cleared — 15 Oct 2026 · all nine L2 keys present, D7 answered (L2 then ran; see below)

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
| **Current stage** | **L12 — ✅ done, 15 Oct 2026.** Reviews are DMCC-compliant by construction (the ask cannot see a rating; an undisclosed incentive is never displayed), quote recovery picks and records a lawful basis per send, and account credit applies automatically at checkout. **L13 (issue resolution and data rights) is next, and needs no keys** |
| **Next action** | *(Claude Code)* start **L13** — PRD §16.3 → L13: the issue thread lifecycle, the re-clean guarantee, and the data-rights work (access, erasure as anonymise/soft-delete, retention). **→ Merge checkpoint 4** after L13. *(Fola)* three checkpoints ready |
| **Working branch** | `build/autonomous`, pushed — L1 → L6, L8 → L12 ahead of `main` (`2f667ff`, untouched); L7 parked |
| **Last updated** | 15 Oct 2026 — **L12 complete.** `reviewAction` takes no rating by design and a test keeps it that way; an incentivised review with no disclosure is refused outright rather than shown unlabelled; quote recovery sends only on consent or soft opt-in and records the basis; credit applies itself, soonest-expiring first, never exceeding the bill. Unit tests 510 → 531, E2E 42 → 45 |
| **Needs Fola?** | **Not to proceed with L13.** Unblocking work unchanged, in order: **Q-16** (dev email), **D3**, **Bacs**, **R2 keys + D4**, **Twilio keys**, `NEXT_PUBLIC_CALCOM_URL`, `GOOGLE_REVIEW_URL`. Still open: **Q-14**, **Q-15**, **Q-17**, **D2** |

## Stage tracker

| Stage | Title | Status | Merge checkpoint |
| --- | --- | --- | --- |
| L1 | Reconcile and guardrails | ✅ Done | |
| L2 | Real database and Stripe test-mode gate (+ Phase 2 gaps 1–3, gate D) | ✅ Done — 15 Oct 2026 (evidence below) | ✅ 1 ← **here** |
| L3 | Admin operations core | ✅ Done — 15 Oct 2026 (evidence below) | |
| L4 | Crew roster, capacity and availability | ✅ Done — 15 Oct 2026 (evidence below) | |
| L5 | Crew mobile interface | ✅ Done — 15 Oct 2026 (evidence below) | |
| L6 | Access codes | ✅ Done — 15 Oct 2026 (evidence below) | ✅ 2 ← **here** |
| L7 | Media exchange | ⛔ Parked — needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | |
| L8 | Quality checklists | ✅ Done — 15 Oct 2026 (evidence below) | |
| L9 | Notifications and recurring self-service | ✅ Done — 15 Oct 2026 (SMS delivery parked: Twilio keys) | |
| L10 | Payroll and owner rate-card editor | ✅ Payroll done — 15 Oct 2026; editor ⛔ parked on D3 | ✅ 3 ← **here** |
| L11 | Commercial RFQ, invoicing and Bacs | ✅ Done — 15 Oct 2026 (Bacs, Cal.com link and PDF storage parked) | |
| L12 | Reviews, growth and content gaps | ✅ Done — 15 Oct 2026 (Google review link parked) | |
| L13 | Issue resolution and data rights | ☐ Next | ✅ 4 |
| L14 | Launch hardening | ☐ Not started | |
| L15 | Release candidate and LAUNCH.md | ☐ Not started | ✅ 5 |

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
- ~~**L2 — recurring booking → `Subscription`**~~ **Closed 15 Oct 2026** (`85bd8dd`), proven by gate D.
- ~~**L2 — collection beyond the card hold**~~ **Built 15 Oct 2026** (`d2616ed`) as D7 = A, and **switched off** until its consent wording is approved (Q-14). So the gap itself is closed in code and still open in behaviour until that flag flips — stated plainly rather than ticked.
- ~~**L2 — unauthenticated server action**~~ **Closed 15 Oct 2026** (`deb3773`), with the scan test that stops the next one.
- **L4 — capacity is config-backed, but the engine is ready.** **Corrected:** `src/lib/capacity.ts` is already a pure function taking `crews: CrewAvailability[]` and `existingJobs: ExistingJob[]`. L4 is a loader, not a rewrite.
- **L4 — `JobAssignment`** has `isLead`/`assignedAt` only; no `offeredAt`/`acceptedAt`/`declinedAt`.
- **L4 — `CrewProfile`.** **Corrected:** it *does* have `dbsCheckedAt`. Missing are `dbsExpiresAt` and `insuranceExpiresAt`.
- **L6 — access codes are further along than the stage title suggests.** **Corrected:** AES-256-GCM encrypt/decrypt, the reveal window and `canRevealAccessCode` are built and tested in `src/lib/access-codes.ts`; `Property.accessCodeEncrypted`/`alarmCodeEncrypted` and `AccessCodeAudit` are in the schema. What is missing is the crew reveal surface and **refusal logging** — `recordAccessCodeView` writes only on success, so `AccessCodeAudit` cannot distinguish a reveal from a refusal. Needs an `outcome` field.
- **L12** — schema has no `Review.wasIncentivised`/`incentiveDisclosed`, no `Job.isPromotional`, no `Quote.abandonedAt`/`recoveryEmailSentAt`.
- **Post-launch** — schema still uses `AIInsight`, not `AgentAction` (PRD §16.4).

### Deferred items carried forward
- ~~Payment-link copy/reissue on `/admin/jobs`~~ **Done in L2** (`6a3ef75`, `f737108`).
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
- **Q-12** · L7 · **Media retention.** *(Now blocking: L7 is parked for its R2 keys, and this decision is the second thing it needs.)* `.env.example` pre-fills `MEDIA_RETENTION_MONTHS="12"` while SETUP D4 is blank, so L7 would ship 12 months by default. Options: 12 / 18 / 24 months (answer D4). L7 reads D4, not the example default; until D4 is answered the retention value is parked. Blocks: L7 retention only.

- **Q-14** · L2 · **Card-on-file consent and pre-contract wording (legal).** D7 = A means the customer's card is saved at booking and charged automatically later, which changes what they agree to at checkout. `CLAUDE.md` makes legal wording a Park item, so the mechanism is built behind a confirmed-wording flag and the draft sits in `src/config/legal.ts` marked `TODO(legal)`; nothing new is shown to a customer until Fola approves it. Options: approve the draft as written / amend it with an adviser / have the wording drafted against the CCR and Stripe's mandate requirements before any off-session charge is enabled. Blocks: switching mechanism A on for real customers (it is exercised by tests and in dev only). **This is the one L2 item that needs Fola.**

- **Q-15** · L2 · **An admin booking with a manual price, set to recur.** With a hand-set price (§9.7) the engine has no per-visit figure to give — it may have refused to price the job at all — so the series repeats at the price the admin quoted and no first-clean surcharge is recorded (none was applied). That is the only reading that invents no number, and the audit note on the job says so, but it is a money decision and it is yours. Options: the manual price **is** the per-visit price (what is built) / the manual price covers the first visit only and the engine prices the rest / recurring admin bookings with a manual price are refused until a per-visit price is entered separately. Blocks: nothing; it affects admin-created recurring bookings only.
- **Q-16** · L2 / L9 · **No dev email is being delivered — a Resend account limit, not the code.** The L1 guard correctly redirects every non-production send to `DEV_EMAIL_REDIRECT`, and Resend then refuses it: *"You can only send testing emails to your own email address (afolinks@hotmail.com). To send emails to other recipients, verify a domain at resend.com/domains."* The failure is logged and never breaks a booking, but nothing arrives — so no booking confirmation, pre-contract email, payment request or sign-in link can be read on this machine. Options: set `DEV_EMAIL_REDIRECT` to the address the Resend account is registered to / verify a domain at Resend and set `EMAIL_FROM` to it (a `LAUNCH.md` step anyway) / leave it until L9. Blocks: nothing in L2–L8; **it would hollow out L9**, where the whole feature is email and SMS arriving.

- **Q-17** · L10 · **Does holiday pay apply to crews at all, and at what rate?** Payroll shows accrual at the statutory **12.07%** of hours worked (5.6 weeks expressed as a proportion of a working year) and labels it as a figure, not a liability — because whether it is owed depends on whether crews are employees, workers or genuinely self-employed (§14.6, SETUP **D2**, undecided). A genuinely self-employed contractor accrues none. Options: confirm 12.07% as the accrual for workers / set a different contractual rate / mark it not applicable until employment status is settled. Blocks: nothing in code — the column records days taken either way — but the figure on the payroll screen is either meaningful or misleading depending on the answer.

## Review queue (Fola reviews at merge checkpoints)

Format: **R-n** · stage · file(s) · what changed · why · data-safety note (migrations).

Per SETUP D1 = A these were built, tested and committed; they wait for Fola at **merge checkpoint 1**, after L2.

- **R-1** · L1 · `prisma.config.ts`, `package.json` · The `package.json#prisma` block moved to `prisma.config.ts` to clear a Prisma 7 deprecation. **Read this one before L2 runs any migration:** a Prisma config file makes Prisma stop loading `.env` itself, so the new file loads it explicitly, and it loads `.env.local` *before* `.env` because `process.loadEnvFile` never overwrites an already-set name. The obvious order would let the stale `.env` placeholder win and point migrations at `localhost`. *Data-safety:* no schema change; this only determines **which database** a migration reaches, which is why it is here.
- **R-2** · L1 · `scripts/assert-dev-db.ts`, `prisma/seed.ts`, `package.json` · New deny-by-default guard on every migrate, push, reset, deploy and seed: refuses unless the connection host equals `DEV_DB_HOST`, normalising Neon's pooled host against the direct one. Also called inside `prisma/seed.ts`, because `prisma db seed` goes through `prisma.config.ts` and never touches the npm script. `db:deploy` is guarded too, so `LAUNCH.md` will give the direct `npx prisma migrate deploy` command instead. *Data-safety:* this guard only ever refuses; it cannot cause a write.
- **R-3** · L1 · `src/config/site.ts`, `src/lib/trust.ts` + 7 surfaces · Public copy changed: four factual claims are withheld until confirmed. Worth your eyes because it is what customers now read. Reversing it is one edit — set `confirmed: true` on a claim in `src/config/site.ts` and it reappears everywhere.

- **R-4** · L2 · `prisma/manual-migrations/2026-10-15-user-default-payment-method.sql`, `prisma/schema.prisma` · **New migration (#10).** Adds `User.stripeDefaultPaymentMethodId` — the Stripe `pm_…` handle of the card to charge off-session on completion (SETUP D7 = A). *Data-safety:* nullable, no default, no backfill, `IF NOT EXISTS`. It cannot fail on an existing row and cannot change a stored value; every existing row keeps NULL, which the code reads as "no card on file" and falls back to the payment-request path. Reversing it is a `DROP COLUMN`, which loses only the handles — the cards live at Stripe and are re-readable. Written **only** by the signed webhook, never from a client, and it is not card data.
- **R-5** · L2 · `src/lib/collection.ts`, `src/lib/stripe.ts`, `src/app/actions/payments.ts`, `src/components/booking/PaymentStep.tsx`, `src/config/legal.ts` · **Payment flow — card on file (D7 = A).** The card is saved at booking and charged off-session on completion for a job more than ~6 days ahead and for every recurring visit. **Ships off**: `CARD_ON_FILE_CONSENT.confirmed` is `false`, so until Fola approves the consent wording (**Q-14**) every booking behaves exactly as before. Worth your eyes on two judgements: the boundary at 6 days rather than 7 (a job exactly 7 days out would be captured against an authorisation expiring that day), and `authentication_required` being reported separately from a decline (the customer can still pay; telling an admin "declined" would send them chasing a new card).
- **R-6** · L2 · `src/lib/materialise.ts` (was `src/lib/inngest/subscriptions.ts`) · **Pricing logic.** Materialised visits are now priced from the `Subscription` row instead of a fresh `computeQuote`. The old code read the live rate card, so changing a rate would have repriced every existing subscription — which `CLAUDE.md` → *Money rules* forbids. Duration still comes from the quote, since duration is not a price. The series is also anchored on the first **visit** rather than `createdAt`; on the old anchor a fortnightly booking made in a different week from its first visit put the series on the opposite week, leaving the booked job beside a near-duplicate.
- **R-7** · L2 · `src/lib/outstanding.ts` · **Payment flow — expired payment links.** The re-charge idempotency key could not distinguish "same request" from "the session has expired", so Stripe returned the expired session and both admin Reissue and the customer's Pay button produced a dead link. Now: open → the same link, nothing written; complete → refused, rather than a second link for money already paid; expired → a new session keyed on the superseded one. Found by the L2 gates; it was not visible without a real Stripe account to expire a session against.
- **R-8** · L2 · `src/lib/outstanding.ts`, `src/app/actions/payments.ts`, `src/app/actions/account.ts`, `src/app/actions/actions-authorise.test.ts` · **Auth / RBAC.** `prepareOutstandingCheckoutForVerifiedJob` moved out of the `"use server"` module into `src/lib/` with `import "server-only"`; the scan test now fails any action export that makes no authorisation decision. Behaviour of the two real entry points is unchanged.
- **R-9** · L2 · `src/app/actions/booking.ts`, `src/app/actions/admin.ts`, `src/lib/subscriptions.ts` · **Recurring bookings create a `Subscription`.** No schema change. One judgement to confirm: an admin booking with a **manual price** (§9.7) has no engine per-visit figure, so the hand-set price becomes the per-visit price for the series, recorded in the audit note — raised as **Q-15** rather than assumed silently.

- **R-10** · L3 · `prisma/manual-migrations/2026-10-15-blackout-policy.sql`, `prisma/schema.prisma` · **New migration (#11).** Adds `BlackoutDate.policy` (`BlackoutPolicy` enum: `flag` | `shift`) so a blackout date can say whether visits landing on it are held for review or moved to the next working day. *Data-safety:* a new enum type plus a column **with a default**, so every existing row reads `flag` — exactly the behaviour it had before the column existed. Cannot fail on existing rows, cannot change a stored value. Reverse: `DROP COLUMN` + `DROP TYPE`, which returns the materialiser to always flagging.
- **R-11** · L3 · `src/lib/job-status.ts`, `src/app/actions/admin.ts` (`setJobStatus`) · **Auth / RBAC and the §9.1 pipeline.** A new role-gated action that moves a job between statuses, refuses illegal transitions server-side, and logs every change with the actor in the same transaction. Worth your eyes on which transitions are *forbidden*: a completed job cannot be rewound or cancelled, and a cancelled booking cannot be revived — both would mean refunding work we did or charging for work we did not. If you disagree with any of those, they are one map in one file.
- **R-12** · L3 · `src/app/(site)/**`, `src/app/layout.tsx`, `src/components/layout/SiteChrome.tsx` · **Route move, no behaviour change.** Every public page moved into a `(site)` route group so the admin area is not wrapped in the marketing header, footer, sticky CTA and cookie banner. Route group names never appear in URLs, so **no public path changed** — worth a glance precisely because that is a large diff for a change that should be invisible to customers. A gate asserts both sides, and the sitemap, robots and 404 were checked.

- **R-13** · L4 · `prisma/manual-migrations/2026-10-15-crew-roster-and-capacity.sql`, `prisma/schema.prisma` · **New migration (#12).** Three additive changes: `CrewProfile.dbsExpiresAt` / `insuranceExpiresAt` (a "checked" date cannot drive a warning — an admin needs to know when it runs out); `JobAssignment.offeredAt` / `acceptedAt` / `declinedAt` (D2's `offer` mode needs the offer itself on the record, not only its outcome — §14.6); and a `CapacitySetting` table for §7.4's daily cap and override, which must survive a restart. *Data-safety:* every column is nullable or defaulted and the new table is empty, so no existing row changes meaning. Reverse: `DROP COLUMN` / `DROP TABLE`; the only loss is the capacity settings themselves.

- **R-14** · L5 · `prisma/manual-migrations/2026-10-15-crew-pin-and-issue-types.sql`, `prisma/schema.prisma` · **New migration (#13).** An `AuthAttempt` table for the crew PIN lockout, and two new `IssueType` labels (`access_problem`, `additional_work`) for what §9.2 has a crew report from the job. *Data-safety:* a new empty table, and adding an enum label does not remap existing rows. The `ALTER TYPE` statements run **outside** a transaction (no `-1`) — the runner detects that automatically and a test pins which files it applies to. Reverse: `DROP TABLE`; enum labels cannot be dropped in Postgres without recreating the type, which is why adding one is a decision rather than a tidy-up.
- **R-15** · L5 · `src/lib/crew-pin.ts`, `src/lib/crew-session.ts`, `src/app/actions/crew.ts` · **Auth.** A second way into the application: a PIN. Worth your eyes because it is a weaker credential than a magic link by design, and what makes it acceptable is the lockout (5 failures, lengthening), the hashing (scrypt, per-PIN salt), and the fact that it reaches only a crew member's own jobs and no money at all. One bug worth knowing about was found here by its own test: a corrupt hash decoding to an empty buffer compared **equal** to anything, so a blanked-out `passwordHash` would have authenticated every PIN. Fixed, with the test kept.

- **R-16** · L6 · `prisma/manual-migrations/2026-10-15-access-code-audit-outcome.sql`, `prisma/schema.prisma` · **New migration (#14).** `AccessCodeAudit.outcome` (`revealed` | `refused`) and `reason`. *Data-safety:* a new enum type plus a column **with a default**, so every existing row keeps the meaning it was written with — each one was a successful reveal, because that was the only kind the old code wrote. Nothing fails on existing rows and no stored value changes. Reverse: `DROP COLUMN` + `DROP TYPE`, returning the audit to success-only.
- **R-17** · L6 · `src/app/actions/crew.ts` (`revealAccessCode`), `src/lib/access-codes.ts`, `src/components/crew/AccessCodeReveal.tsx` · **Access-code handling.** The one place a plaintext alarm or lockbox code exists in the system. Worth reading in full: it decrypts only on request (never into a page payload), checks both conditions server-side, logs every attempt including refusals, never echoes the stored payload or a decryption error, and returns the code to a single request. The accompanying scan (`access-codes.leak.test.ts`) is what keeps it true as templates are added later.

- **R-18** · L8 · `prisma/manual-migrations/2026-10-15-checklist-item-fields.sql`, `prisma/schema.prisma` · **New migration (#15).** `JobChecklistItem` gains `requiresPhoto`, `groupLabel` and `sortOrder`. The first is the stage's acceptance criterion and is stored **on the item** rather than read from the template, because §9.6 calls a completed checklist evidence in a deposit dispute and a template edited months later must not change what was agreed on the day. *Data-safety:* all three are defaulted or nullable; existing rows become "no photo required, no group, order 0", which is exactly how they behaved before. Reverse: `DROP COLUMN`.

- **R-19** · L9 · `prisma/manual-migrations/2026-10-15-notification-log.sql`, `prisma/schema.prisma` · **New migration (#16).** A `NotificationLog` table: the scheduled senders run repeatedly and "has this already gone out?" cannot be answered from a job's own state — a job is `scheduled` both before and after its reminder. `dedupeKey` is unique so two concurrent runs cannot both decide they are the one sending. It is also the PECR audit: a row is written when a message is **withheld** for want of consent, not only when one is sent. It deliberately stores **no message body** — that would be a new home for a payment link or an access code. *Data-safety:* a new empty table; nothing else changes. Reverse: `DROP TABLE`.
- **R-20** · L9 · `src/lib/notifications/*`, `src/lib/sms.ts`, `src/app/api/sms/inbound/route.ts`, `src/app/(site)/unsubscribe/page.tsx` · **PECR and outbound messaging.** Worth your eyes because getting it wrong is a regulatory matter rather than a bug: which triggers are classified as marketing (two — the review request and the lapsing win-back), that a missing consent field fails **closed**, that `STOP` and the email unsubscribe write the **same single field**, and that the unsubscribe link acts on a GET without a confirmation step (deliberate — it is signed, and an "are you sure?" is what makes people press spam instead).

- **R-21** · L10 · `prisma/manual-migrations/2026-10-15-crew-holiday-flag.sql`, `prisma/schema.prisma` · **New migration (#17).** `CrewUnavailability.isHoliday`. §9.8 asks for holiday accrual tracking, and days *taken* have to be recorded — a free-text `reason` cannot be counted, since "hol", "annual leave" and "away" are one thing to a person and three to a query. *Data-safety:* a boolean defaulting to false, so every existing row keeps its meaning. Reverse: `DROP COLUMN`. Note it records a fact and decides no entitlement — that is **Q-17**.
- **R-22** · L10 · `src/lib/payroll.ts`, `src/lib/payroll-db.ts`, `src/app/admin/payroll` · **Money owed to people.** Worth reading for the three judgements rather than the code: hourly pays for attended-but-not-completed work, per-job does not, and percentage counts a job once however many crew were on it. Rounding is half away from zero. Access is owner/admin only, because pay rates are one of the few things one member of staff must not read about another.

- **R-23** · L12 · `prisma/manual-migrations/2026-10-15-review-provenance-and-recovery.sql`, `prisma/schema.prisma` · **New migration (#18).** `Review.wasIncentivised` / `incentiveDisclosed`, `Job.isPromotional`, `Quote.abandonedAt` / `recoveryEmailSentAt` (the §15 gaps). Two review fields rather than one because there are three real states, and the middle one — incentivised but **not** disclosed, which must never be displayed — is the one a single boolean cannot express. *Data-safety:* all five nullable or defaulted false, so every existing row keeps its meaning. Reverse: `DROP COLUMN`. Note the drift check caught two of these missing from `schema.prisma` after a botched edit, which is what it is for.
- **R-24** · L12 · `src/lib/reviews.ts`, `src/lib/credit.ts`, `src/app/actions/booking.ts`, `src/lib/inngest/growth.ts` · **Compliance and money.** Two things worth your eyes: the DMCC decisions (the ask cannot see a rating, by construction; an undisclosed incentive is refused rather than shown unlabelled), and credit now changing what a customer is charged at checkout — applied automatically, soonest-expiring first, never exceeding the bill, drawn down only after the booking is saved.

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

Decisions taken during L2:

- **D-11** · L2 · The `dev` branch is **baselined at the pre-migration-#1 schema** and then migrated, rather than `db push`-ing the current schema. Why: a fresh push creates every column the nine migrations add, so the migrations never run and the gate proves nothing — while production will have to run them for real. The baseline lives in `prisma/baseline/schema.prisma` with its provenance in the header. Alternative: push the current schema and trust the files — rejected, that is the assumption L2 exists to remove. Reverse: delete the baseline directory and the `db:baseline` script.
- **D-12** · L2 · The four **one-shot migrations** (#1, #3, #4, #6 — unguarded `CREATE TYPE` / `CREATE TABLE`) are **left as they are**, with the split pinned by a test, rather than made idempotent. Why: they may already have been applied to Fola's Neon `gate` branch, and editing SQL that has run somewhere is how a database and its migration set quietly stop matching. Consequence: the supported sequence is *baseline once, then apply once*; the fix loop resets `dev` to the baseline and re-runs the whole set. Alternative: add `IF NOT EXISTS` to all four — reversible, and worth doing if Fola confirms the `gate` branch never ran them. Reverse: edit the four files and update `db-migrate-manual.test.ts`.
- **D-13** · L2 · **Playwright** added as the E2E runner (`@playwright/test`, dev dependency), per PRD §16.3 → L2. Justification (`CLAUDE.md` requires one per dependency): the gates need a real browser for the booking wizard, the admin board and Stripe's hosted 3-D Secure page; unit tests stay on `node --test` via `tsx`. Reverse: remove the dependency, `playwright.config.ts`, `e2e/` and `scripts/e2e.ts`.
- **D-14** · L2 · Cards in the gates are confirmed through **Stripe's API**, not typed into the Payment Element. Why: Stripe paints that widget on a `<canvas>` in nested iframes with no DOM inputs — verified frame by frame — deliberately resisting automation. Everything of ours is still covered (intents, webhooks, reconciliation, capture, refund, off-session), and the 3-D Secure page is real DOM so that path is genuinely walked. What is not covered is typing into Stripe's widget, which stays with the manual pass in `docs/DEPLOYMENT.md` §4b. Alternative: drive the canvas by coordinates — rejected as a test that would break on any visual change while proving nothing extra. Reverse: n/a.
- **D-15** · L2 · The E2E stack runs on **port 3100** through `scripts/e2e.ts`, which starts `stripe listen` **before** `next dev` so the session's webhook signing secret can be passed to the server. Why: `SETUP.md` §3.3 has the secret come from the CLI per session; a server started without it rejects every event, so nothing reconciles. Playwright's own `webServer` cannot express that ordering. Reverse: delete the script and start the three processes by hand.
- **D-16** · L2 · Admin-side gates sign in by **inserting an Auth.js `Session` row and setting its cookie**. Why: Auth.js here uses database sessions, so that is all a session is; the alternatives were reading Fola's inbox for a magic link, or a dev-only sign-in route — which is a real authentication bypass living in the app for the sake of a test. This touches no production code and still passes through the real `requireRole`. Reverse: delete `e2e/support/admin.ts`.
- **D-17** · L2 · The materialiser's work moved from the Inngest function into `src/lib/materialise.ts`, leaving the Inngest file as the schedule only. Why: gate D has to run it twice and assert the series, which is the only way to prove "no duplicate first visit" against a real database rather than by reading the code. Reverse: inline it back into the Inngest function.
- **D-18** · L2 · `scripts/load-env.ts` is a **side-effect module** imported first, rather than a loop at the top of each script. Why: ES imports are evaluated before the importing file's body, so inline loading reads in the right order without necessarily running in it; a side-effect import does, because imports evaluate in source order. It also fixed a real bug — `prisma/seed.ts` asserted the dev-db guard but loaded no env, so `npm run db:seed` could never have run. Reverse: inline the two lines per script.
- **D-19** · L2 · Card-on-file is gated on `CARD_ON_FILE_CONSENT.confirmed`, with a **non-production-only** `CARD_ON_FILE_DEV_PREVIEW` escape for the gates. Why: PRD L2 says do not ship the consent wording unapproved, and the mechanism is the wording — so the switch is the wording's own `confirmed` flag, and an env var can never turn it on in production (asserted by a test). Alternative: build it behind no flag and rely on nobody deploying — rejected. Reverse: set `confirmed: true` once the wording is approved (Q-14).

## Checkpoint merge notes

### Checkpoint 1 — after L2 · ready for Fola

**What is on the branch.** L1 (4 commits) plus L2 (8 commits) on `build/autonomous`,
pushed. `main` is untouched at `2f667ff`. Phase 2's booking and payments code has now
been run against a real Neon database and real Stripe test mode for the first time.

**Migrations to apply before merging** — migrate-before-swap, to whatever database
Vercel **Production** points at, in filename order (`docs/DEPLOYMENT.md` §4a):

```
prisma/manual-migrations/
  2026-09-19-service-area-patch-group.sql                  psql -1
  2026-09-20-lead-converted-quote-and-domestic-sales.sql    psql (no -1 — ALTER TYPE … ADD VALUE)
  2026-09-20-quote-manual-override.sql                      psql -1
  2026-09-24-payments-reconciliation-webhook-status.sql     psql -1
  2026-09-27-payment-status-part-paid.sql                   psql (no -1 — ADD VALUE)
  2026-09-28-authjs-tables.sql                              psql -1
  2026-09-30-payment-checkout-session-id.sql                psql -1
  2026-09-30-payment-status-released.sql                    psql (no -1 — ADD VALUE)
  2026-09-30-user-stripe-customer-id.sql                    psql -1
  2026-10-15-user-default-payment-method.sql                psql -1   ← new in L2
```

All ten have been applied to `dev` in this order, and `npm run db:drift` then prints an
empty migration. On a **fresh** database `prisma db push` creates the whole schema and
none of them is needed (§4a); they exist to evolve a database that already holds rows.
Four of them (#1, #3, #4, #6) are **one-shot** — applying them twice errors — so apply
once and confirm with the drift check rather than re-running (D-12).

**New Production environment variables from L2** — none required. Two optional:

| Name | Scope | Note |
| --- | --- | --- |
| `CARD_ON_FILE_DEV_PREVIEW` | **Preview / dev only — never Production** | Exercises mechanism A before its wording is approved. It is ignored when `APP_ENV=production`, by design, but do not set it there |
| `STRIPE_WEBHOOK_SECRET` | Production | Already required; the **endpoint's subscribed events now include `setup_intent.succeeded`** (see below) |

**One Stripe dashboard change is required before the card-on-file mechanism is ever
switched on:** add **`setup_intent.succeeded`** to the Production webhook endpoint's
events (`docs/DEPLOYMENT.md` §4b now lists it). Without it a card is saved that nobody
records, and the charge on completion falls back to a payment-request email — quietly,
which is the failure mode that list exists to prevent. Not urgent while
`CARD_ON_FILE_CONSENT.confirmed` is `false`.

**Review-queue items in scope:** R-1, R-2, R-3 (L1) and **R-4 … R-9** (L2). R-4 is the
new migration, R-5 the card-on-file payment flow, R-6 the materialiser's pricing, R-7
the expired-payment-link fix, R-8 the server-action auth change, R-9 the subscription
work. R-5, R-6 and R-7 are the three to read if you read only three — they are the ones
that move money.

**What still needs you, and what it blocks:**

| | What | Blocks |
| --- | --- | --- |
| **Q-14** | Approve (or amend) the card-on-file consent wording in `src/config/legal.ts`, then set `confirmed: true` | Mechanism A going live. Until then, bookings more than ~6 days ahead and recurring visits still fall back to a manual payment-request email — the gap found on 9 Oct, now with the mechanism built and tested behind the flag |
| **Q-15** | Confirm how a manual admin price maps onto a recurring series | Admin-created recurring bookings only |
| **Q-16** | Point `DEV_EMAIL_REDIRECT` at the Resend account's own address, or verify a domain | Nothing now; **would hollow out L9** |
| Q-3, Q-8 | The trust facts, and the insurance sentence in the T&Cs | Nothing in code; both are live on the site today |

---

### Checkpoint 2 — after L6 · ready for Fola

**What is on the branch since checkpoint 1.** L3 (admin operations core), L4 (crew roster,
capacity and availability), L5 (crew mobile interface) and L6 (access codes). The business
now has an operations back office, a booking wizard that only offers staffable slots, a
crew app, and access codes that can be opened by the right person and nobody else.

**Migrations to apply before merging** — in filename order, after the ten from
checkpoint 1 (`docs/DEPLOYMENT.md` §4a):

```
  2026-10-15-blackout-policy.sql                 psql -1    ← L3
  2026-10-15-crew-roster-and-capacity.sql        psql -1    ← L4
  2026-10-15-crew-pin-and-issue-types.sql        psql       ← L5 (no -1 — ALTER TYPE … ADD VALUE)
  2026-10-15-access-code-audit-outcome.sql       psql -1    ← L6
```

All four are applied to `dev` and `npm run db:drift` prints an empty migration. Every one
is additive: new columns are nullable or defaulted, new tables are empty, and the two new
`IssueType` labels do not remap existing rows.

**New Production environment variables** — none. `CARD_ON_FILE_DEV_PREVIEW` remains
Preview-only and must not be set in Production.

**One Stripe dashboard change still outstanding from checkpoint 1:** add
`setup_intent.succeeded` to the Production webhook endpoint before card-on-file is ever
switched on.

**Review-queue items in scope:** R-10, R-11, R-12 (L3), R-13 (L4), R-14, R-15 (L5), R-16,
R-17 (L6). If you read four, read **R-15** (the crew PIN — a weaker credential by design,
and what makes it acceptable), **R-16** and **R-17** (access codes — the one place a
plaintext alarm code exists), and **R-11** (which job status changes are forbidden, and
why).

**Two behaviour changes a customer could notice:**

1. The booking wizard now offers **fewer slots**, because it only offers ones a real crew
   can staff: travel buffers between districts, a crew's day that never spans two patches,
   and the daily cap. That is the intended behaviour (§7.4: "you cannot offer a slot you
   cannot staff"), but it will look like reduced availability compared with the placeholder
   roster.
2. **Admin screens no longer carry the marketing header, footer or cookie banner.** No
   public URL changed.

---

### Checkpoint 3 — after L10 · ready for Fola

**What is on the branch since checkpoint 2.** L8 (quality checklists), L9 (notifications,
PECR and visit self-service) and L10's payroll half. L7 (media exchange) is **parked** on
its R2 keys and L10's rate-card editor is **parked** on D3 — both stated in full in their
stage logs rather than silently skipped.

**Migrations to apply before merging** — in filename order, after checkpoint 2's four:

```
  2026-10-15-checklist-item-fields.sql      psql -1    ← L8
  2026-10-15-notification-log.sql           psql -1    ← L9
  2026-10-15-crew-holiday-flag.sql          psql -1    ← L10
```

All three applied to `dev`, drift empty, all additive: defaulted or nullable columns and
one new empty table.

**New Production environment variables** — none required. Two that matter when they are
filled: `TWILIO_*` (SMS cannot send without them and reports `not_configured`) and
`GOOGLE_REVIEW_URL` (the review request sends without it, asking the customer to reply by
email instead).

**Review-queue items in scope:** R-18 (L8), R-19, R-20 (L9), R-21, R-22 (L10). **R-20** is
the one to read: it is the PECR surface — which messages are classified as marketing, that
a missing consent flag fails closed, and that `STOP` and the email unsubscribe write the
same single field.

**What is NOT demonstrated, and should not be taken as working:**

- **No email is delivered in this environment at all.** The Resend account can only send to
  its own address (**Q-16**). Every send is attempted, guarded and recorded — and refused
  by Resend with a 403. For L9, whose subject is messages arriving, this is the gap.
- **No SMS can be sent** — the Twilio keys are empty (`SETUP.md` §3.8).
- **No media can be uploaded** — the R2 keys are empty, so L7 is parked and photo-required
  checklist items are held rather than tickable.

**Two decisions are now blocking real work:** **D3** (rate-card editor), and **D4** (media
retention, needed by L7).

---

#### Ready-to-paste PR description

> **L1 + L2 — guardrails, a real database, and the Stripe test-mode gate**
>
> Phase 2's booking and payments code had never run against a real database or
> real Stripe. It has now.
>
> **The database.** The Neon `dev` branch was baselined at the schema as it stood
> before the first manual migration, then all ten migrations were applied in
> filename order — the way Production will have to apply them, rather than letting
> `prisma db push` create the columns and never exercising the SQL.
> `prisma migrate diff` then prints an empty migration, which is the first actual
> proof that the migration set and `schema.prisma` agree.
>
> **The gates.** `npm run test:e2e` brings up `stripe listen` and `next dev` in the
> order that works and runs 14 Playwright gates against Stripe test mode: the large
> job (deposit captured + balance authorised on one card, through a real 3-D Secure
> challenge, then captured on completion), the full-amount job, the cooling-off
> cancellation (deposit refunded, hold released), and the recurring booking end to
> end. Plus the failure paths: declined card, expired card, an off-session charge
> the bank refuses, a final price above the authorisation, a replayed webhook, a
> mis-signed webhook, and a re-charge event naming another job's rows.
>
> **The three Phase 2 gaps found on 9 October are closed.**
> 1. A recurring booking now creates a `Subscription` and its first `Job`, so the
>    materialiser and the customer's pause/resume/cancel have something real to act
>    on. Previously "weekly" was a word in `Job.notes` and the customer got one
>    clean.
> 2. Card on file (SETUP D7 = A): the card is saved at booking and charged
>    off-session on completion for jobs more than ~6 days ahead and every recurring
>    visit. **It ships switched off** — saving a card to charge later changes what
>    the customer agrees to, and that wording is unapproved, so every booking keeps
>    today's behaviour until it is.
> 3. `prepareOutstandingCheckoutForVerifiedJob` was an unauthenticated server action
>    handing out a Checkout URL plus a customer's name and email for any job id. It
>    is now server-only and not an action, and a test fails any future action export
>    that makes no authorisation decision.
>
> **Bugs found by running it, not by reading it.** `npm run db:seed` could never have
> worked (the guard refused for want of an env file nothing loaded). An expired
> Checkout Session was reissued as itself, so both admin Reissue and the customer's
> Pay button produced a dead link. The materialiser would have repriced every
> existing subscription the day a rate changed. And the booking wizard's labels were
> not associated with their inputs, so a screen reader announced "edit text, blank".
>
> **Since then (L3–L6).** The admin back office became an operations tool: a Today view
> that answers what is happening today, a filtered job board, the §9.1 status pipeline
> enforced server-side with every change logged against its actor, a payments queue,
> customer records, and blackout dates that hold or move affected visits on purpose.
> Capacity moved off its placeholder roster onto the database, with §7.5 travel buffers
> and the §4 rule that a crew's day never spans two patches — proved by a property-based
> test over 200 generated rosters. Crews got a phone app: PIN sign-in with a real lockout,
> clock in/out with GPS that never blocks, one-tap status and issue reporting, and access
> codes revealed only to the crew on the job, only around the appointment, decrypted per
> request, with every attempt logged — including the refusals, which are the rows worth
> reading.
>
> Unit tests 190 → 396, E2E gates 14 → 30. Typecheck, lint, build and the drift check
> are clean. Nothing was run against production, live Stripe keys or any database but
> the Neon `dev` branch.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)

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

**2.1 Database baseline and migrations** — ✅ done (`1372243`)
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

**2.2 Local stack** — ✅ done (`8c10757`, `scripts/e2e.ts`)
- [ ] `next dev`, the Inngest dev server, and
      `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3000/api/stripe/webhook`,
      whose output sets `STRIPE_WEBHOOK_SECRET` for the session (never pasted into `.env.local`).

**2.3 Playwright and the runbook gates** — ✅ done (`8c10757`, `f737108`)
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

**2.4 Payment-link reissue** — ✅ done (`6a3ef75`, `f737108`)
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

**2.8 Gate D — recurring booking end to end** — ✅ done (`f737108`)
- [ ] Book weekly → exactly one `Subscription` and one first `Job` → run the materialiser
      twice → the series exists with no duplicate first visit → complete visit 2 →
      payment collected per D7 = A.

**2.9 Close the stage** — ✅ done
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

**2.4 Payment-link recovery and reissue — ✅ done (`6a3ef75`, fixed in `f737108`).**

Deferred from Phase 2, where an admin booking's link was emailed once and then
unrecoverable. "Get payment link" reads the session Stripe actually holds; "Reissue"
goes through the same re-charge core as customer self-pay, so rows are superseded in
place and a job can never carry two live links for one amount.

**2.2 + 2.3 Local stack and Playwright — ✅ done (`8c10757`, `f737108`).**

`npm run test:e2e` is the whole stack in one command (`scripts/e2e.ts`): it starts
`stripe listen`, captures that session's webhook signing secret, and only then starts
`next dev` with it on port 3100. The ordering is the reason the runner exists — a
server started without the secret rejects every event with a 400, so nothing
reconciles and the gates fail for reasons unrelated to the code. The Stripe CLI now
requires an explicit `--events` list, so the forwarded list lives in one place and is
documented as the list the **production endpoint must match**; `setup_intent.succeeded`
was added to both (`docs/DEPLOYMENT.md` §4b).

**One limitation, stated rather than implied.** Cards are confirmed through Stripe's
API, not typed into the Payment Element. Stripe now paints that widget on a `<canvas>`
inside nested iframes with no DOM inputs — checked frame by frame, not assumed —
deliberately resisting automation. Everything that is *ours* is still exercised end to
end: the intents our code creates (capture method, Customer, `setup_future_usage`,
metadata), the real webhook deliveries through `stripe listen`, our reconciliation,
and capture, refund and off-session charging on real Stripe objects. The 3-D Secure
challenge page *is* ordinary DOM, so that path is genuinely walked — `COMPLETE` on
Stripe's test ACS page, in the browser. What is not covered is the typing of digits
into Stripe's own widget, which stays with the manual pass in §4b.

```
$ npm run test:e2e
✓ stripe listen ready (webhook signing secret captured, not printed)
✓ next dev ready on http://localhost:3100

✓  1 a declined card leaves the booking standing, unpaid, with nothing to capture
✓  2 an expired card is reported as a decline, not as a system failure
✓  3 an off-session charge the bank won't allow flags admin and leaves the job completed
✓  4 a final price above the authorisation captures the maximum and leaves the difference
✓  5 gate A: deposit captured + balance authorised on one card through 3DS, then captured
✓  6 gate B: authorise the full amount at booking, capture it on completion
✓  7 gate C: cancel inside 14 days refunds the deposit and releases the balance
✓  8 gate D: a weekly booking creates one subscription, a clean series, and collects visit 2
✓  9 an outstanding job yields one payment link, and reissuing does not create a second
✓ 10 an expired session is reported as expired and reissues cleanly
✓ 11 a replayed delivery of a processed event changes nothing
✓ 12 an unsigned or mis-signed delivery is rejected
✓ 13 a paid re-charge session settles exactly its own pending rows, once
✓ 14 an event naming rows of a different job settles nothing

14 passed (2.0m)
```

**What each gate actually pins down**, beyond "it worked":

- **A** — both intents belong to **one** Stripe Customer and the balance is confirmed
  with the PaymentMethod the deposit left behind, because that is the property that
  silently becomes a second card entry if it regresses. The job reads `part_paid`, not
  `captured`, while most of the money is only held. Both intents' `amount_received`
  sum to the job total at the end.
- **B** — the authorisation is only ever flipped by the **webhook**; the booking code
  never pre-stamps it.
- **C** — the deposit is refunded *and* the hold is released. Those fail differently: a
  missed refund keeps the customer's money, a missed release leaves a hold that expires
  quietly — fine from our side, a frozen £292 from theirs. `released` stays distinct
  from `failed`, since a hold we cancelled is not a failure (§8).
- **D** — **materialise twice.** Once proves nothing: a series anchored on the wrong
  week still produces jobs. The second run must create **0**, every visit must be at a
  distinct time, the booked visit must appear exactly once, and visits 2+ must be
  priced from the `Subscription` row rather than a fresh quote.
- **Failure cases** — the point of each is that the job is untouched. A declined or
  expired card leaves the booking `booked` and unpaid, not cancelled. An off-session
  refusal records `authentication_required` and "Job unchanged", leaves the job
  `completed`, and offers *Send payment request* — not a decline message that would
  send an admin chasing a new card the customer does not need.
- **Webhook** — a mis-signed delivery is rejected 400 (the guard that makes the rest
  meaningful), a replay of a processed event changes nothing at all, and a re-charge
  event naming **another** job's rows settles nothing.

**A real bug the gates found, in the money path.** The re-charge idempotency key is
derived from the job, the total and the row set — none of which change when a Checkout
Session **expires**. So Stripe kept returning the expired session, and both admin
"Reissue" and the customer's own Pay button in `/account` handed over a link that
failed the moment it was opened. Fixed in the shared core, so both callers get it: the
stored session is read first, and if it is still open the same link is returned with
nothing written (a double click and a page refresh both land there); if it is complete
the request is refused rather than minting a link for money already paid; only if it
has expired is a new session created, with the superseded id in the key. This is
exactly the class of defect L2 exists to catch — it was invisible without a real
Stripe account to expire a session against.

**Accessibility defects the gates surfaced** (`CLAUDE.md` requires WCAG 2.2 AA): the
booking wizard's labels were not associated with their inputs, so a screen reader
announced "edit text, blank" with no field name and tapping a label did not focus the
field; and two button groups used a `<label>` that named no control. Fixed with
`htmlFor`/`id` throughout, `aria-describedby` on error messages only when there is one,
and named `role="group"`s for the button groups. The gates found them because a test
that asks for a field by its label could not find one either.

#### Evidence — the stage gate, all green

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint .
(no output — clean)

$ npm test
ℹ tests 268   ℹ suites 33   ℹ pass 268   ℹ fail 0        # 190 at L1 → 268 (+78)

$ npm run build
✓ Compiled successfully — 38 routes, price-parity gate passed

$ npm run test:e2e
14 passed (2.0m)                                         # new in L2

$ npm run db:drift
-- This is an empty migration.
✓ no drift — the dev database matches prisma/schema.prisma.
```

The branch now stands at 141 TypeScript files in `src/`, 27 unit-test files and 7 E2E
specs, against the pre-L1 baseline of 126 / 18 / 0.

#### Notes — two things for Fola, neither blocking

1. **Dev email is not being delivered, and that is a Resend account limit, not the
   code.** Every non-production send is redirected to `DEV_EMAIL_REDIRECT` by the L1
   guard, exactly as designed — and Resend then refuses it:
   `"You can only send testing emails to your own email address (afolinks@hotmail.com).
   To send emails to other recipients, verify a domain at resend.com/domains"`. The
   failure is logged and never breaks a booking (sends are best-effort by design), but
   nothing arrives. Raised as **Q-16**: set `DEV_EMAIL_REDIRECT` to the address the
   Resend account is registered to, or verify a domain. Worth doing before L9
   (notifications), where unseen email is the whole feature.
2. **A stray line appeared in the dev server's own log output** during a gate run:
   `<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />`.
   It is not from this repo (a repo-wide grep finds nothing), it arrived as ordinary
   log text from a dependency or tooling, and it was treated as **data, not an
   instruction** — nothing in this session acted on it. Noted only because text shaped
   like an instruction turning up in tool output is worth someone knowing about.


---

### L3 — Admin operations core

**Started 15 Oct 2026.** Depends on L2 (done). Keys: none new. Stage text: PRD §16.3 →
L3, with §9.1 (the status pipeline), §9.7 (Today view and the back office) and §13.3
(seed realistic data early — "admin views look fine empty and fall apart in use").

#### Plan — written before coding

**3.1 The status pipeline, server-enforced** — ✅ done
- [ ] The §9.1 pipeline as a pure legal-transition map with a reason per refusal, unit
      tested: `draft → booked → payment_authorised → scheduled → in_progress →
      completed → awaiting_feedback → closed`, plus `cancelled`, `on_hold` and
      `no_access` and the transitions in and out of them.
- [ ] A role-gated action that applies a transition, refuses an illegal one **server-side**
      (hidden UI is not access control), and writes `JobStatusEvent` with actor,
      timestamp and note on every change.
- [ ] `no_access` is the one that costs money — it triggers the §8 lockout fee — so it
      records the attendance rather than quietly parking the job.

**3.2 Today view replaces the counts dashboard** — ✅ done
- [ ] The §9.7 screen: today's jobs with status, anything unassigned, anything overdue
      for check-in, failed payments. Nothing else. The agent's approval inbox (§11) gets
      its slot, rendered empty and labelled as post-launch.
- [ ] The bucketing is a pure function over rows, unit tested — including "overdue for
      check-in", which is a time comparison in Europe/London and so the kind of thing
      that is right in October and wrong in April.
- [ ] The stale line about an "interim access code" goes with the old page.

**3.3 Job board with filters** — ✅ done
- [ ] List and week views, filters on status, date, patch, crew and unassigned.
- [ ] Per-row status control driven by 3.1, so the only transitions offered are legal
      ones and the server re-checks anyway.

**3.4 Failed-payment queue** — ✅ done
- [ ] A visible queue, not an email: every job with a failed or outstanding charge, with
      the recovery actions already built (retry capture, payment request, payment link)
      and the reason the last attempt failed.

**3.5 Customer records** — ✅ done
- [ ] List and detail: properties, jobs, subscriptions, payments, consent state.

**3.6 Blackout dates** — ✅ done (migration #11)
- [ ] Admin CRUD, and a **per-date policy**: flag the affected visits for review, or
      shift them. The materialiser already flags; shifting needs the policy stored, so
      `BlackoutDate.policy` is an additive migration (→ *Review queue*).
- [ ] Affected materialised jobs are never silently generated — that is the property
      under test.

**3.7 Realistic seed data, dev only** — ✅ done
- [ ] §13.3: 20 customers, 50 jobs across every status, 3 crews, both patch groups.
- [ ] Refuses to run when `APP_ENV=production`, on top of the dev-db host guard, and
      nothing it creates is rendered on a public route.

**3.8 Recurrence across the hard boundaries** — ✅ done
- [ ] §13.4: a series across a **bank holiday** and across **both** clock changes,
      asserting the London wall-clock time holds and the blackout is flagged, not skipped.

**3.9 Confirm rather than rebuild** — ✅ done
- [ ] Discount codes (§10.2), admin-created bookings with payment link / invoice (no cash
      on any path), CSV client import — all exist; confirm with tests and leave alone.

**Acceptance (PRD):** the Today view answers "what is the state of today" from seeded
data in one screen; illegal transitions are rejected; the recurrence tests pass across
the boundaries.

#### Work — ✅ stage complete (`85eaec7`, `b-fixups`)

**3.1 The status pipeline.** `src/lib/job-status.ts` is the §9.1 pipeline as a legal
transition map with a reason per refusal, and `setJobStatus` re-applies it server-side —
the dropdown is built from the same map, so the UI cannot offer what the server will
refuse, and the server does not trust the UI. Every change writes `JobStatusEvent` with
the actor, in the same transaction as the update: a status with no trail is worse than a
refused change, because the trail is what explains a refund or a lockout fee later.

Three rules are deliberate and tested as such:

- **A completed job cannot be rewound**, to anything. The clean happened. A wrong price
  is settled on the payment; bad work is an issue and a re-clean.
- **A completed job cannot be cancelled** — that would refund a customer for work we did.
- **`cancelled` and `closed` are terminal.** Reviving a cancelled booking means undoing a
  refund; the honest move is a new booking, which keeps both records.
- **`no_access` can be resolved**, to scheduled, cancelled or closed. A crew that could
  not get in leaves a job that is neither done nor abandoned, and it carries the §8
  lockout fee — treating it as terminal would strand the customer's money with no path.

**3.2 Today view.** The counts dashboard is gone. Three totals (jobs, leads, customers)
answered a question nobody asks before 7am and said nothing about whether anyone is going
to the 9 o'clock in Clapham. It is now the four buckets §9.7 names, in the order an
operator needs them — overdue check-in and unassigned **before** the timetable — plus the
agent's slot, rendered empty and labelled, so the screen's shape does not change the day
the agent layer arrives.

The failed-payments bucket is deliberately **not** limited to today: money that failed
last week is still today's problem, and a screen that hides it is comforting rather than
true.

**3.6 Blackout dates** now carry a **per-date policy** — hold the visit for review, or
move it to the next working day — because the two cases are different instructions to the
scheduler. A bank holiday the crew will work around should move; a closure needs a human
to speak to the customer. The default is *hold*, since a visit silently moved is a
customer not expecting us. Migration #11; drift still empty. A moved visit says on the job
itself where it moved from, so it is never invisible.

**3.7 Dev seed.** §13.3 asked for this and said why — *"admin views look fine empty and
fall apart in use"* — which is exactly what the old dashboard did. 20 customers across
seven districts including Bromley (its own patch, §4), 50 jobs weighted like a working
business rather than evenly spread, 3 crews. It refuses to run when `APP_ENV=production`
on top of the dev-host guard, every customer is `@example.com`, and it creates **no**
`Review` rows — an invented review is exactly what the content rules forbid.

```
$ npm run db:seed:dev
✓ dev database confirmed (ep-red-scene-…) — proceeding.
  3 crews · 20 customers with a property each · 50 jobs across 11 statuses
✓ dev seed complete — 6 unassigned upcoming, 1 failed payment(s).
```

**3.8 Recurrence across the hard boundaries** (§13.4). The tests assert the property that
matters, not that occurrences exist: the customer's **London wall-clock time holds while
the UTC instant moves**. A series that kept 09:00 by accident of a fixed offset would pass
a weaker test, so each one asserts the UTC hour *does* shift across the boundary.

```
$ npx tsx --test src/lib/recurrence.test.ts
ℹ tests 14   ℹ pass 14   ℹ fail 0
  ✔ a Monday series across the Christmas closure holds the visit for review
  ✔ the same date with policy 'shift' moves the visit and says where from
  ✔ a date's own policy overrides the call's default, in both directions
  ✔ GMT begins mid-series: 09:00 London stays 09:00, and the UTC hour shifts
  ✔ BST begins on Easter Monday 2027, which is also a bank holiday
  ✔ a run of consecutive blackouts shifts past all of them, not into the next one
```

**3.9 Confirmed rather than rebuilt.** Discount codes, the admin booking (payment link or
invoice), and the CSV import all exist and pass (15 tests). The **no-cash** rule (§12.5)
is now a source scan rather than a convention: the guard today is a zod enum admitting
`payment_link` and `invoice` only, and the way that regresses is someone adding a third
value in a hurry.

**One defect found by looking at the screen rather than the code.** Every admin page was
wrapped in the marketing header, footer, sticky "Get a price" bar and cookie banner,
because the root layout wrapped every route. A quarter of an operations screen spent on
things an operator cannot act on, with a consent prompt aimed at a member of staff
floating over the job board — the opposite of §9.7's thirty seconds. The public site now
lives in a `(site)` route group that carries the chrome; the admin area does not. Route
group names never appear in URLs, so **no public path changed**, and the 404 keeps the
chrome explicitly so a mistyped URL still looks like the website. A gate asserts both
sides, because this is easy to undo by accident.

The L1 trust-claim scan caught its own exemption going stale in that move (the T&Cs page
is exempt by path, Q-8) — the scan working as designed.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 328   ℹ pass 328   ℹ fail 0     # 268 → 328 (+60)
$ npm run build           ✓ Compiled successfully — 36 routes
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        21 passed (2.2m)                        # 14 → 21 (+7)
```

**Acceptance (PRD §16.3 → L3):**

- *"The Today view answers 'what's the state of today' from seeded data in one screen"* —
  gate: `the Today view answers the day's state in one screen`, against the §13.3 seed.
- *"Illegal transitions rejected"* — 17 unit tests on the map, plus a gate asserting the
  board offers a completed job only *Awaiting feedback* and *Closed*, never *In progress*
  or *Cancelled*, and a gate that applies a legal one and checks the actor was recorded.
- *"Recurrence tests pass across the boundaries"* — above.

**Two E2E gates had to be updated**, and both were the tests being wrong rather than the
code: a completed job now correctly leaves the board's default *upcoming* view (its money
is on the payments queue, which is where the gate now looks), and the board moved the date
into the day heading, so a row matched by date text no longer matched — it is matched by
job id now, which cannot drift.

---

### L4 — Crew roster, capacity and availability

**Started 15 Oct 2026.** Depends on L3 (done). Keys: none new. Stage text: PRD §16.3 →
L4, with §7.4 (capacity), §7.5 (travel time) and §4 (Bromley is a separate patch).
SETUP **D2 = not decided**, so both assignment modes are built and tested.

#### Plan — written before coding

**4.1 Schema** — ✅ done (migration #12)
- [ ] `CrewProfile.dbsExpiresAt`, `CrewProfile.insuranceExpiresAt` — `dbsCheckedAt`
      already exists; the expiries are what an admin warning can actually key off.
- [ ] `JobAssignment.offeredAt`, `acceptedAt`, `declinedAt` — the `offer` mode needs a
      record of the offer, not just the outcome.
- [ ] `CapacitySetting` — the daily cap and the admin override have to persist
      somewhere, and §7.4 makes them a requirement, not a preference.

**4.2 Patch and travel rules in the capacity engine** — ✅ done
- [ ] §7.5 buffers: **45 minutes cross-district, 30 within**. Today the engine applies
      one flat buffer, which is the "Clapham at 12:00, Peckham at 12:30" case the PRD
      names as impossible.
- [ ] §4 **Bromley rule**: a crew's day never spans two `patchGroup`s. This is the
      arithmetic reason Bromley is separate, so it belongs in the engine, not in a
      reviewer's head.
- [ ] Both are additive and optional: **the existing capacity tests must pass
      unchanged** (PRD says this explicitly — `capacity.ts` is already a pure function
      and L4 is a loader, not a rewrite).

**4.3 The loader** — ✅ done
- [ ] Read `CrewProfile.workingHours`, `CrewUnavailability` and booked `Job` rows into
      the `CrewAvailability[]` / `ExistingJob[]` shapes the engine already takes.
- [ ] Fall back to the config roster when no crew rows exist, so a fresh database still
      offers slots rather than showing a customer an empty calendar.

**4.4 `SlotAvailability` service** — ✅ done
- [ ] One entry point: duration from the quote engine, roster and time off from the
      database, existing bookings, travel buffers, blackout dates, the daily cap and the
      admin override.
- [ ] `getSlots` (the wizard's step 5) reads **only** real slots through it.

**4.5 Assignment** — ✅ done (both D2 modes)
- [ ] Multi-crew with a lead; assign / unassign from the job board.
- [ ] **Both modes per D2**: `assign` (the system assigns) and `offer` (crews are offered
      work they can decline, recorded with `offeredAt` / `acceptedAt` / `declinedAt`).
      The production value is chosen before launch; both are tested.
- [ ] Crew roster screen with **DBS and insurance expiry warnings** (§9.7).

**4.6 Capacity controls** — ✅ done
- [ ] Daily cap and admin override, per §7.4's "simple daily cap as a fallback in early
      operation when the roster is small".

**4.7 Acceptance (PRD)** — ✅ met
- [ ] A **property-based** test: over many generated rosters and job sets, no slot the
      engine offers exceeds capacity, and no crew day mixes patches.
- [ ] The override and the cap work.

#### Work — ✅ stage complete

**4.2 The two rules that make a slot real.** §7.5's travel buffers (45 minutes between
districts, 30 within) and §4's patch rule (a crew's day never spans two patches) are now
in the engine, where they are arithmetic rather than something a scheduler has to
remember. Both are **additive and optional**: a caller that knows nothing about districts
gets the flat buffer it always had, and `capacity.test.ts` passed unchanged, as PRD L4
requires.

The PRD's own example is a test: a crew finishing in Clapham (SW4) at 12:00 is not
offered Peckham (SE15) at 12:30. The first offer is 12:45 — the engine steps from the end
of the buffer rather than a half-hour grid, which is the right trade on a small roster.

**4.7 The property-based acceptance test.** 200 generated rosters — varying crew counts,
time off, existing jobs across three patches, varying durations — and for every slot the
engine offers, four invariants: no overlap with an existing job **or its travel buffer**,
never during time off, never a crew-day that mixes patches, and always inside the working
window on the right day. Property-based because the failures here are combinations nobody
would think to write down; the seed is deterministic, so a failure is reproducible.

```
$ npx tsx --test src/lib/capacity-rules.test.ts
ℹ tests 11   ℹ pass 11   ℹ fail 0
  ✔ the PRD's own example: Clapham at 12:00, Peckham at 12:30 is refused
  ✔ a crew already working in another patch that day offers nothing
  ✔ over 200 generated rosters, every invariant holds
  ✔ the daily cap holds, and the admin override lifts it
```

**4.3 / 4.4 From placeholder to real.** `loadRoster` and `loadExistingJobs` read
`CrewProfile.workingHours`, `CrewUnavailability` and the diary into the shapes the engine
already took; `slotAvailability` is the one place that assembles duration, roster, time
off, diary, buffers, patch, blackouts, cap and override. `getSlots` — the wizard's step 5
— now reads **only** through it, and the wizard passes the customer's postcode so the
district and patch rules can apply at all.

Two deliberate behaviours: the config roster still stands in when **no crew rows exist**
(a fresh environment should not show a customer an empty calendar), and a failure in the
service offers **no** slots rather than falling back to invented ones — an empty calendar
sends the customer to the contact route, which is recoverable; a made-up slot is a crew
who never turns up.

**4.5 Both assignment modes (D2 unanswered).** `assign` and `offer` are built and tested.
The distinction that matters is what counts as cover: in `offer` mode an **unanswered
offer is not cover**, so a job with three outstanding offers and no acceptance still shows
as unassigned. Treating an offer as an answer is how a morning arrives with nobody on
site. `offeredAt` / `acceptedAt` / `declinedAt` are all stored because for genuinely
self-employed crews (§14.6) "we offered it and they declined" is the record that evidences
the relationship — the outcome alone would lose the fact that a choice was given.
Re-offering work someone has declined is refused, in those words: that is how an offer
turns into pressure.

**4.5 / 4.6 The screens.** A crew roster ordered worst-first by compliance, where an
**unrecorded** expiry ranks above one that is merely running out — it looks fine and means
nobody has checked. Warnings start 60 days out, which is long enough to renew a DBS, and
dates are compared on the London calendar so a certificate is valid all day on the day it
expires. Capacity gets its §7.4 daily cap and override, per date or as a standing default,
both stored **with a reason** — a cap someone set on Tuesday for a good reason looks
exactly like a bug in availability on Thursday.

**One defect found by the gates.** Removing a blackout date rendered its confirmation
inside the row being removed, so the message flashed and vanished — and that message is
the one saying visits already held or moved stay as they are. The status now lives on the
list, which outlives the row.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 367   ℹ pass 367   ℹ fail 0     # 328 → 367 (+39)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        24 passed (2.6m)                        # 21 → 24 (+3)
```

**Acceptance (PRD §16.3 → L4):** *"property-based test — no generated slot exceeds
capacity; no crew day mixes patches; override and cap work"* — all four invariants over
200 rosters, plus the cap and override as their own test. The existing capacity tests pass
**unchanged**, which was the stage's other explicit requirement.

---

### L5 — Crew mobile interface

**Started 15 Oct 2026.** Depends on L4 (done). Keys: none new. Stage text: PRD §16.3 →
L5, with §9.2 (the interface) and §8 (lockout fee).

#### Plan — written before coding

**5.1 Crew PIN sign-in** — ✅ done
- [ ] PIN **hashed** with scrypt (`node:crypto`, no new dependency), never stored or
      logged in the clear.
- [ ] Sign in with email **or** phone plus PIN, on a **persistent** session — §9.2 is
      explicit that this is a phone, often on mobile data, sometimes shared.
- [ ] **Rate-limited, with lockout after repeated failures.** A 4-digit PIN is 10,000
      guesses; without a lockout it is not a credential. Needs a small attempts table
      (additive migration). *(General rate limiting is L14 and SETUP D5; this is the
      specific lockout L5 requires, and Postgres-backed so it needs no D5 answer.)*
- [ ] **Shared-device-safe sign-out**: one tap, ends the session server-side, and the
      next person gets a sign-in screen rather than the previous crew's day.

**5.2 Today's jobs and job detail** — ✅ done
- [ ] Today's jobs, in schedule order; job detail with property, access instructions
      (the L6 reveal), parking, pets, product preferences, customer notes.
- [ ] "Open in Maps" deep link — no map key is supplied, so an embedded map is out
      (the stage text allows exactly this).

**5.3 Clock in / out** — ✅ done
- [ ] Timestamp plus GPS. **GPS denied is recorded, not blocking** — a crew who has
      refused location permission must still be able to work, and the refusal itself is
      the honest record.
- [ ] Drives payroll (L10) and the §5 actual-vs-estimated loop, so `durationMinutes` is
      summed crew-minutes, not elapsed.

**5.4 One-tap status and issues** — ✅ done
- [ ] Status updates through the same §9.1 rules as the admin board, so a crew cannot
      make a transition an admin could not.
- [ ] Report an issue: **damage, access problem, extra work needed**. The last two are
      new `IssueType` values (additive `ALTER TYPE … ADD VALUE`).
- [ ] `no_access` records the attendance; the §8 lockout fee is charged separately, so a
      mis-tap cannot take money.

**5.5 What a crew must NOT see — ✅ done, server-enforced**
- [ ] Only their own assigned jobs. Not the diary, not another crew's day.
- [ ] No payment details, no pay rates (their own or anyone's).
- [ ] Enforced in the **queries**, not by hiding UI, and tested by asking for another
      crew's job directly.

**5.6 Acceptance (PRD)** — ✅ met
- [ ] A Playwright run at **375px**: arrive, clock in, read the job, update status, clock
      out, complete — and the capture fires.
- [ ] RBAC tests pass.

#### Work — ✅ stage complete

**5.1 The PIN is a credential, not a formality.** Four digits is ten thousand guesses, so
the lockout is what makes a PIN defensible: five failures locks the account, and each
lockout is longer than the last — 5 minutes, then 15, then an hour. The counter resets on
a **successful** sign-in rather than on time, so attempts spread across a day still add
up. The failure message is the same whether the identifier is unknown or the PIN is
wrong; saying which half was right turns one unknown into two easier ones. PINs are
scrypt-hashed with a per-PIN salt, so the stored hashes do not reveal which accounts share
a PIN.

Sign-in creates a row in Auth.js's own `Session` table and sets its cookie, so `auth()`
and `requireRole` work exactly as they do for a magic link — the alternative was a second
notion of "signed in", which is how an app ends up with one gate that is checked and one
that is forgotten. Sign-out **deletes the row** before clearing the cookie: on a shared
phone, clearing a cookie while the token stays live is not signing out.

**A real bug the tests caught.** `verifyPin` compared with `timingSafeEqual` — correct —
but a corrupt hash can decode to an **empty** buffer, and `timingSafeEqual(empty, empty)`
is `true`. A blanked-out `passwordHash` column would have authenticated every PIN,
including an empty one. Lengths are now checked before the comparison, with the test that
found it kept.

**5.3 GPS never blocks.** The phone is asked for a location with a five-second timeout; a
refusal, an error or a timeout all clock the crew member in **without** coordinates. The
absence is the honest record — "clocked in, location not available" is true, where a
fabricated point would not be. `durationMinutes` is summed crew-minutes across everyone on
the job, not elapsed on-site time: §5's actual-vs-estimated loop compares against a
crew-minutes estimate, so recording elapsed would make every two-person job read about 50%
under and quietly corrupt the feedback loop that corrects pricing.

**5.5 What a crew cannot reach**, enforced in the queries:

- **Only their own assigned jobs.** One helper (`crewJobOrNull`) scopes every action by
  the session's crew id, and the detail page scopes its own query the same way — so
  another crew's job id returns a **404**, not a hidden link. The gate asks for one
  directly, because "the link isn't rendered" is not access control.
- **No money anywhere on the crew app.** No price on the list, the detail or the
  controls — the gate asserts the £ sign appears zero times. A crew member does not need
  the figure, and showing it on a doorstep starts a conversation about money with someone
  who cannot settle it.
- **`no_access` records an attendance; it does not charge.** The §8 lockout fee is a
  separate, deliberate act by the office, so a mis-tap in the rain cannot take a
  customer's money.
- A crew can move a job along its own course — in progress, finished, no access, on hold —
  and nothing else. Cancelling and closing are office decisions with money attached, and
  the same §9.1 rules apply, so a crew cannot make a transition an admin could not.

**5.6 Acceptance — the 375px run.**

```
$ npm run test:e2e -- crew-mobile
✓ a crew member signs in, works a job and signs out, on a phone
✓ a crew member cannot open another crew's job          # 404 on a direct id
✓ the PIN locks out after repeated wrong guesses        # right PIN refused while locked
```

The first walks the whole day: sign in → today's list → job detail → clock in (with
location denied) → clock out → finished → sign out, asserting the rows at each step —
`TimeEntry` with no coordinates, `actualDurationMinutes` summed, the status event carrying
**the crew member** as actor, and the next visit to `/crew` showing a sign-in screen rather
than the last person's day. It also asserts the page does not scroll sideways at 375px: a
horizontal scrollbar on a phone means a thumb cannot reach half the screen.

**Two defects the gates found, both fixed in the app rather than the test:**

1. **The sign-in form lost text typed before hydration.** The fields were controlled React
   state, so anything typed in the moment before hydration was discarded when React took
   over. §9.2's context is "a phone, often on mobile data" — exactly where that moment is
   longest. The form is uncontrolled now and reads its values on submit.
2. **Importing a constant from `prisma/seed-dev.ts` ran the entire seed**, deleting and
   recreating every `@example.com` user as a side effect of an `import` — it deadlocked
   against the test's own queries. The seed now only runs when invoked as a script, like
   every other script in the repo.

**And a flaky-test fix that was the test's fault, not the code's.** Several gates asserted
`Job.paymentStatus` the instant a `Payment` row flipped. The inline capture and the webhook
for the same intent both recompute that derived status, so there is a real moment where
the row is captured and the job has not caught up. Nine assertions now wait for the state
they then assert. Two consecutive full runs are clean.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 389   ℹ pass 389   ℹ fail 0     # 367 → 389 (+22)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        27 passed (2.9m)                        # 24 → 27 (+3)
```

---

### L6 — Access codes

**Started 15 Oct 2026.** Depends on L5 (done). Keys: `ACCESS_CODE_ENC_KEY` (present).
Stage text: PRD §16.3 → L6, §6.9. **→ Merge checkpoint 2.**

#### Plan — written before coding

More of this exists than the title suggests: AES-256-GCM encrypt/decrypt with a versioned
`v1:` payload, `isWithinAccessWindow`, `canRevealAccessCode` and the write-only editing in
`/account/property/[id]` are all built and tested. What is missing is the part that
matters on a doorstep, and the part that matters afterwards.

**6.1 Refusal logging** — ✅ done (migration #14)
- [ ] `AccessCodeAudit` gains `outcome` (`revealed` | `refused`) and the refusal reason.
      Today a row is written only on success, so the audit cannot tell "the crew opened
      the lockbox" from "someone tried and was turned away" — and the second is the one
      worth reading.
- [ ] `recordAccessCodeView` is called on **both** branches of `canRevealAccessCode`.

**6.2 The crew reveal** — ✅ done
- [ ] Assigned crew only, inside the window, decrypted **server-side on request** — never
      rendered into the page payload, because a payload is cached, logged and sent to
      error reporters.
- [ ] A refusal says *why* and what to do instead (ring the office), rather than failing
      silently — a crew locked out of a house needs a next step, not a shrug.

**6.3 Codes never leave the server** — ✅ done
- [ ] A test that renders **every** email and SMS template with a code-bearing fixture and
      scans the output. The rule is in `CLAUDE.md` ("never in any message body") and in
      §6.9; a test is what keeps it true the day someone adds a helpful "access details"
      line to a confirmation email.
- [ ] The same scan covers log lines and error payloads in the access-code path.

**6.4 Acceptance (PRD)** — ✅ met
- [ ] Outside-window reveal **refused and logged**; inside-window reveal **shown and
      logged**; the template scan passes.

**6.5 Checkpoint 2** — ✅ written
- [ ] Merge notes for Fola: migrations in order, review-queue items, a PR description.

#### Work — ✅ stage complete

**6.1 The audit now records refusals.** It recorded only successful reveals, which means
it could not answer the one question anyone ever asks of an access-code log: *was somebody
turned away, and who?* A code is revealed dozens of times a week without incident; a
refusal — a crew member who is not on the job, a request at three in the morning — is the
first sign of something wrong. `outcome` defaults to `revealed`, so every existing row
keeps exactly the meaning it had: each one **was** a successful reveal, because that was
the only kind the code wrote.

**6.2 The reveal is an action, not a page.** The code is decrypted only when a crew member
asks for it and returned to that one request. Rendering it into the job page would put an
alarm code into the router cache, the browser's history entry and any error report the
page produced. The gate asserts the code is **not** in the page's HTML before the button
is pressed.

Both conditions are still checked by `canRevealAccessCode` — assigned crew **and** inside
the window — because hiding a button is not access control. On screen it hides itself
after two minutes: not theatre, but the specific way these leak, which is a phone left on
a kitchen worktop.

A refusal says the reason **and what to do instead**. "Outside the permitted access
window" tells someone standing outside a locked house nothing they can act on; "…ring the
office and they can let you in" does.

**6.3 The leak scan.** Access codes leak through helpful changes, not malicious ones — a
confirmation email that adds "access details so the crew don't have to ask", a log line
added while debugging, an error report that happens to carry the property. So the test
fails on the *shape* of the mistake at the moment it is written: no message-building module
may mention a code field or `decryptAccessCode`, no template string anywhere may
interpolate one, the reveal action may not log the plaintext on any branch, and
`recordAccessCodeView` takes no code parameter — an audit row holding the code would defeat
the encryption it audits.

#### Evidence — acceptance (PRD §16.3 → L6)

```
$ npm run test:e2e -- access-codes
✓ inside the window, the assigned crew sees the code — and it is logged
✓ outside the window the reveal is refused, with a reason — and the refusal is logged
✓ a crew member who is not on the job cannot reveal its codes

$ npx tsx --test src/lib/access-codes.leak.test.ts
ℹ tests 5   ℹ pass 5   ℹ fail 0   ℹ skipped 0
```

Each gate also asserts the audit row does **not** contain the code it is auditing, and the
refusal gate asserts the reason was stored (`/window/i`), not just the fact of a refusal.

**Three defects found by running it, all fixed in the app:**

1. **The crew sign-in did not work before hydration.** A form whose only handler is
   `onSubmit` does a native submit when JavaScript has not attached, reloading the page and
   discarding what was typed. §9.2's context — "a phone, often on mobile data" — is exactly
   where that gap is longest. It is a **server-action form** now, so it works before
   hydration and would work without JavaScript at all.
2. **The job board drew up to 200 rows**, each with three interactive controls. Slow enough
   to time out a gate, and useless to read: the board is for a day or a week, and finding
   one job among hundreds is what the filters are for. 60 a page, and it says when there is
   more behind the filter.
3. Two gates targeted rows by position or date text and broke when the board changed. They
   filter to their own customer and match by job id now — a test that depends on how much
   other data happens to exist is a test that fails on a Tuesday.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 396   ℹ pass 396   ℹ fail 0     # 389 → 396 (+7)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        30 passed (3.3m)                        # 27 → 30 (+3)
```

---

### L7 — Media exchange · ⛔ PARKED — missing keys

**Parked 15 Oct 2026**, per PRD §16.2: *"Each stage lists the keys it needs. If they are
absent from `.env.local`, the agent parks the stage (Blocked, with the missing key named),
and moves to the next stage whose keys are present and whose dependencies are met."*

| Key | State | Where it comes from |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | ❌ empty | Cloudflare → R2 → account id · `SETUP.md` §3.7 |
| `R2_ACCESS_KEY_ID` | ❌ empty | R2 → Manage API tokens → **Object Read & Write, scoped to the bucket only** |
| `R2_SECRET_ACCESS_KEY` | ❌ empty | same token |
| `R2_BUCKET` | ✅ set | `mcseco-media-dev` |
| `MEDIA_LINK_SECRET` | ✅ set | generated in L1 |

**Why it is parked rather than part-built.** Every acceptance criterion in L7 is about
what a *real* presigned URL does: that an expired link fails **server-side**, that a URL
issued for job A cannot write job B's key, that a fresh short-lived GET is minted per
request. Those are properties of R2's signature, not of our code — building them against
a mock would produce tests that pass while the real thing is wrong, which is the failure
mode this whole build is structured to avoid (it is why L2 existed at all).

**Also blocked on a decision:** `MEDIA_RETENTION_MONTHS` depends on **SETUP D4** (12, 18
or 24 months), which is unanswered — see **Q-12**. `.env.example` pre-fills 12, which the
code deliberately does not read as an answer.

**What L7 needs from Fola, in order:**
1. Cloudflare R2 bucket `mcseco-media-dev`, **EU jurisdiction**, with CORS allowing `PUT`
   and `GET` from `http://localhost:3000` and `https://*.vercel.app` (`SETUP.md` §3.7).
2. An API token scoped to **that bucket only** — a wider token in a dev `.env.local` is a
   wider blast radius for no benefit.
3. **D4**: 12, 18 or 24 months' media retention.

**Dependencies for later stages:** L8 (quality checklists) wants photos attached to
checklist items, and L12's location-page gate wants an area photo. Both are built so the
photo part is additive — the checklist works without a photo and says so, rather than
being half-built around an upload that cannot happen.

**Resuming it:** fill the three keys, answer D4, then run L7 from PRD §16.3. Nothing in
L8–L15 has to be revisited.

---

### L8 — Quality checklists

**Started 15 Oct 2026.** Depends on L7 — which is **parked** on its R2 keys. L8 is built
anyway, because only the *photo* part of it depends on media: the checklist itself, the
snapshot, the completion rules and the review view do not. Where a photo is required, the
item is held and says exactly why, rather than being quietly completable. Stage text: PRD
§16.3 → L8, §9.6.

#### Plan — written before coding

**8.1 Schema** — ✅ done (migration #15)
- [ ] `JobChecklistItem.requiresPhoto`, `sortOrder`, `groupLabel`. The first is the
      acceptance criterion ("a photo-required item cannot be ticked without media") and
      cannot be enforced without storing it **on the item**: the template can change after
      a job is snapshotted, and the rule that applied on the day is the one that counts in
      a dispute.

**8.2 Snapshot on scheduling** — ✅ done
- [ ] Copy the service's template onto the job when it is scheduled — a **snapshot**, not
      a reference, because §9.6 calls the checklist "your evidence in a deposit dispute"
      and evidence that changes when someone edits a template months later is not evidence.
- [ ] Idempotent: scheduling twice does not double the list.

**8.3 Completion** — ✅ done
- [ ] Crew ticks items; `completedBy` and `completedAt` recorded.
- [ ] **A photo-required item cannot be ticked without media** — server-enforced.
- [ ] With L7 parked there is no way to attach a photo yet, so those items are **held**
      and say so. That is the honest state: the alternative is letting a crew tick an item
      whose whole purpose is the photograph.

**8.4 Admin and supervisor review** — ✅ done
- [ ] A job detail page in the admin area: the checklist, who ticked what and when, and
      the ability to mark items photo-required (§9.6: "admin can require photo evidence on
      specified items").

**8.5 Acceptance (PRD)** — ✅ met
- [ ] A photo-required item cannot be ticked without media; the checklist is visible on
      the crew job detail and in admin.

#### Work — ✅ stage complete

**8.2 A snapshot, not a reference.** When a job is scheduled, the service's template is
**copied** onto it — in the same transaction as the status change, so a job cannot be
scheduled without one. §9.6 calls a completed end-of-tenancy checklist *"your evidence in
a deposit dispute"*, and evidence that changes when someone edits a template months later
is not evidence. For the same reason `requiresPhoto` is stored **on the item**: the rule
that applied on the day is the one that counts.

It is idempotent by count rather than item-by-item. "Fixing up" a checklist someone has
already part-completed is precisely the thing that must not happen.

A job scheduled before L8 existed gets its checklist when a crew first opens it, and an
admin can add one from the job page — better than leaving someone on a doorstep with no
list.

**8.3 The rule the stage turns on.** A photo-required item cannot be ticked without a
photo, enforced server-side. With L7 parked there is no way to attach one, so those items
are **held** — shown, greyed, labelled "photo needed", with a message that says photo
upload is not switched on and to tell the office. That is the honest state. The
alternative is letting a crew tick an item whose entire purpose is the photograph, which
would leave the dispute evidence looking complete and being worthless.

**8.4 The supervisor view.** `/admin/jobs/[id]` is the account of a visit: the checklist
with **who ticked each item and when**, the time entries (including "no location given"),
the money, the issues raised, and the status trail. In a dispute the useful sentence is
"the oven was photographed clean by this person at this time", not "the list was
completed".

An admin can require a photo on an item or take the requirement off. It changes **this
job's** item, not the template — and requiring a photo on something already ticked
without one is refused, because that would make the record self-contradictory: completed,
and not completable.

#### Evidence — acceptance (PRD §16.3 → L8)

```
$ npm run test:e2e -- checklists
✓ a crew sees the checklist, can tick ordinary items, and cannot tick a photo-required one
✓ the checklist is visible in admin, with who ticked what
✓ an admin can require a photo on an item, and take it off again
```

The first asserts both halves: an ordinary item ticks and records the crew member and the
time, while the photo-required one is **disabled in the UI and still unticked in the
database** — the tick is refused, not merely hidden.

A unit test also pins the end-of-tenancy template against §9.6's list — oven interior,
cupboards, limescale, skirting, interior windows, extractor fans — so if someone trims it
for being long, the test says why it is long.

**One test-hygiene fix:** three specs' hand-written teardown broke at once when jobs
gained checklist rows. Teardown is one `deleteJobCascade` helper now; a test that cannot
clean up after itself leaves rows the next run trips over, which looks like a product bug
and is not one.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 415   ℹ pass 415   ℹ fail 0     # 396 → 415 (+19)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        33 passed (2.9m)                        # 30 → 33 (+3)
```

---

### L9 — Notifications and recurring self-service

**Started 15 Oct 2026.** Depends on L5. **Keys: `TWILIO_ACCOUNT_SID` and
`TWILIO_AUTH_TOKEN` are empty**, so the SMS *sending* half parks per PRD §16.2; everything
else is built, and the SMS messages themselves are written, gated and tested so that
filling the keys turns them on without further work. Stage text: PRD §16.3 → L9, §10.3,
§7.3, §14.

**One thing to know before reading the evidence:** no email is being delivered in this
environment at all — the Resend account can only send to its own address (**Q-16**). The
outbound guard behaves correctly and the sends are attempted and recorded; what cannot be
demonstrated here is an email *arriving*. Tests therefore assert what **would** be sent,
and the gap is stated rather than papered over.

#### Plan — written before coding

**9.1 One registry for the §10.3 matrix** — ✅ done
- [ ] Every row of §10.3 as data: trigger, channels, recipient, and **whether it is
      marketing or transactional**. A matrix spread across a dozen call sites cannot be
      tested row by row, which is exactly what the acceptance criterion asks for.

**9.2 Sending** — ✅ done (SMS delivery parked on the Twilio keys)
- [ ] An SMS sender that goes through the **existing** outbound guard, and **parks
      cleanly** without Twilio keys: it records what it would have sent instead of
      throwing, so the rest of the stage is testable and the day the keys arrive nothing
      else changes.
- [ ] A dedupe record, so a reminder fires once however many times the scheduler runs.

**9.3 PECR, in one place** — ✅ done
- [ ] Marketing gates on `User.marketingConsent`; transactional messages do not, and say
      nothing promotional.
- [ ] **SMS `STOP` and email unsubscribe set the same single field**, so opting out of one
      channel opts out of all — §10.3 is explicit that there is no per-channel split.
- [ ] A test that every marketing sender goes through the gate, by construction rather
      than by inspection.

**9.4 Recurring self-service** — ✅ done
- [ ] Customer can **skip one visit** or move it, from the account and from a link in the
      3-day message.
- [ ] **Skipping or moving a visit never touches the subscription** — the series carries
      on. That is the §7.3 rule and the one most likely to be got wrong.

**9.5 Admin alerts** — ✅ done
- [ ] Complaint raised → email + the dashboard. Job stuck in progress → dashboard.

**9.6 Acceptance (PRD)** — ✅ met, with one gap stated
- [ ] A test per trigger; `STOP` honoured across channels; **no access code in any body**
      (the L6 scan, extended to the new templates); non-production sends redirected.

#### Work — ✅ stage complete (SMS delivery parked)

**9.1 The matrix is data.** All thirteen §10.3 rows live in one registry with their
channels, audience and — the load-bearing field — whether they are **marketing**. Written
as thirteen call sites, "did we build the subscription-lapsing email?" has no answer you
can compute; as a list it is a test, and that test found **seven triggers that were
declared and never sent**. They are sent now.

The first version of that test passed trivially, because the registry file itself contains
every trigger id. Excluding it is what turned a green test into a list of gaps — worth
recording, because a scan that reads its own declaration is the most comfortable kind of
false pass.

**9.3 PECR, decided in one pure function.** `decideSend` gates marketing on
`User.marketingConsent` and nothing else gates it anywhere. Two directions both matter:
gate a booking confirmation and the customer never learns their clean is booked; fail to
gate a review request and it is a breach. A **missing** consent field reads as *no*
consent — a caller that forgot to load the column fails safe.

**Consent is one field, so `STOP` stops everything.** §10.3 is explicit that there is no
per-channel split, and that is also what a person means. A customer who texts STOP has
their marketing consent withdrawn on every channel, dated, and recorded — so a later
export or campaign cannot treat them as subscribed and claim nobody knew. The email
unsubscribe takes effect on a **GET with no confirmation step**: someone who clicked
unsubscribe has said what they want, and an "are you sure?" is the pattern that makes
people mark mail as spam instead. It is safe because the token is signed — otherwise an
unsubscribe link is just a user id, and anyone can unsubscribe anyone.

**9.4 Skipping a visit never touches the plan (§7.3).** The rule most likely to be got
wrong, and a revenue behaviour as much as a correctness one: a customer who is away one
week and cannot easily say so cancels the whole plan instead. One tap on the booking, a
confirmation that states the consequence, and the series carries on. The trail says
"Customer skipped this visit. The plan is unchanged" — because "cancelled" on its own
reads later as a lost customer.

#### Evidence — acceptance (PRD §16.3 → L9)

```
$ npm run test:e2e -- notifications
✓ the email unsubscribe link switches off marketing on every channel
✓ a forged or broken unsubscribe link changes nothing
✓ texting STOP opts out of email as well — one field, every channel
✓ an ordinary reply is not treated as an opt-out
✓ a customer can skip one visit, and the plan carries on

$ npx tsx --test src/lib/notifications/registry.test.ts
ℹ tests 39   ℹ pass 38   ℹ fail 0   ℹ skipped 1    # a test per §10.3 row
```

The skipped one is "Job stuck in progress", which §10.3 puts on the dashboard and which is
already a Today-view bucket. An alert nobody can act on at 2am is noise.

**No access code in any body** — the L6 scan extended: no template is handed a code field,
the SMS copy carries nothing identifying (the "crew on the way" message has no name, no
address, no time), and the notification log deliberately stores **no message body**, which
would otherwise be a new home for a payment link or a code.

**Non-production sends redirected** — unchanged from L1 and still the first thing every
sender does, before any provider is touched.

#### ⚠️ What this stage could not demonstrate

**No email was delivered, and none could be.** The Resend account can only send to its own
address (**Q-16**), so every send in this environment is attempted, guarded, recorded —
and refused by Resend with a 403. The tests therefore assert what *would* be sent and what
the system recorded; they cannot assert that anything arrived. For a stage whose subject is
messages arriving, that is a real gap, and it is the single most useful thing Fola can
clear: `DEV_EMAIL_REDIRECT` set to the Resend account's own address, or a verified domain.

**SMS is written but cannot send.** `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are empty,
so `sendSms` reports `not_configured` and records what it would have sent. It is
deliberately **not** a mock that reports success — a send that silently "worked" without a
provider is how a business discovers at launch that no customer has ever received a text.
Filling the keys is the only change needed.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 473   ℹ pass 472   ℹ fail 0   ℹ skipped 1   # 415 → 473 (+58)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        38 passed (3.2m)                        # 33 → 38 (+5)
```

**Three defects the gates found, all fixed in the app:**

1. A helper exported from a `"use server"` module (`notifyCrewOfScheduleChange`) — the
   gap-3 scan caught it the moment it was written, which is what that scan is for. Moved
   to `src/lib` with `server-only`.
2. The **payments queue could bury its worst item.** It fetched the oldest hundred rows and
   ranked them afterwards, so a charge that failed this morning could sit behind a hundred
   old pending ones and never appear. Failures are fetched first now, separately. A queue
   that can hide its worst item is worse than no queue, because it looks complete.
3. A skipped visit's confirmation **unmounted with the button that produced it** — the same
   shape as the blackout-row defect in L4. The row itself says it was skipped now.

---

### L10 — Payroll and owner rate-card editor

**Started 15 Oct 2026.** Depends on L5 (done). **Pre-authorisation: SETUP D3 is
unanswered**, so the rate-card editor is **parked** and the payroll half is built. Stage
text: PRD §16.3 → L10, §9.8, §17.4. **→ Merge checkpoint 3.**

#### The parked half, stated first

**D3 — "Owner rate-card editor (Task 5) cleared to build in L10"** has neither box ticked.
The stage lists it as a **pre-authorisation**, not a preference, and the reason is in the
feature itself: an editor that publishes rate-card figures is the one tool in this system
that can change every future price. `CLAUDE.md` also puts rate-card figures outside what
this build may decide. So it is not started, and nothing half-built is left behind.

If D3 is answered **yes**, the editor is built to §17.4: owner only, draft → validate →
publish, immutable versions, `RATE_CARD_VERSION` bumps, existing quotes and subscriptions
never repriced, preview and diff, audit log, one-click rollback, seeded from the code card
as version one — and the agent never publishes changed figures itself. If **no**, rates
stay code-only and L10 is complete as it stands.

#### Plan — written before coding

**10.1 Payroll figures** — ✅ done
- [ ] Per crew member, over a period: hours worked from `TimeEntry`, jobs completed, and
      pay owed under their own `payType` — hourly, per job, or a percentage of job value.
- [ ] Pure, so the arithmetic is testable: this is money owed to people, and a rounding
      error in it is a wage dispute.
- [ ] **Holiday accrual** — the statutory 12.07% method, *clearly labelled*, and raised as
      an open question: whether it applies at all depends on employment status (§14.6,
      SETUP D2), which is undecided.

**10.2 The period report** — ✅ done
- [ ] Owner/admin only. A period picker, the figures per crew member, and the totals.
- [ ] Every figure traceable to the entries behind it — a payroll report nobody can check
      is one nobody can defend.

**10.3 CSV export** — ✅ done
- [ ] §9.8: "a format your accountant or payroll software can consume".

**10.4 Acceptance (PRD)** — ✅ met (payroll half; the editor is parked on D3)
- [ ] The export **reconciles to the time entries**: the hours in the CSV are the hours in
      `TimeEntry`, summed, with nothing lost to rounding.

#### Work — ✅ payroll complete; the rate-card editor parked on D3

**10.1 The arithmetic, tested as arithmetic.** Three pay types, because the three are
genuinely different relationships and not three ways of saying the same thing:

- **Hourly** pays for time, including time on a job that did not complete — they were
  there.
- **Per job** pays for completed visits only: a job the crew attended and which was
  cancelled underneath them is a conversation, not an automatic payment. Two clock-ins on
  one job (someone who breaks for lunch) pay **once**, while all the time is still counted.
- **Percentage** pays a share of completed work, counted **per job** rather than per
  entry — otherwise a two-person crew pays out twice the share of a job the business
  charged for once.

Rounding is to whole pence, half away from zero, in the worker's favour where it falls:
37 minutes at £14.00 is £8.63, not £8.00. A negative duration in bad data cannot reduce
someone's pay.

**10.2 / 10.3 Report and export.** Owner and admin only — pay rates are among the few
things one member of staff must not be able to read about another. Every line shows **how
the figure was reached** ("3.50h × 14.00/h"), because a payroll report nobody can check is
one nobody can defend. The CSV is generated **server-side from the same functions the
screen uses**: a CSV rebuilt in the browser from a rounded table is how a payroll run ends
up a few pence out with nobody able to say why. A name containing a comma is quoted — the
kind of bug found at the end of a payroll run.

Hours count into a period by **clock-in**, so a visit starting at 23:30 on the last day of
the month belongs to that month; splitting it would be wrong and impossible to explain on
a payslip. Open shifts — clocked in, not out — are excluded, because paying an unfinished
shift guesses at hours nobody has worked.

#### Evidence — acceptance (PRD §16.3 → L10)

```
$ npx tsx --test src/lib/payroll.test.ts
ℹ tests 17   ℹ pass 17   ℹ fail 0

$ npm run test:e2e -- payroll
✓ the payroll report and its CSV reconcile to the time entries
✓ an open shift is not paid, because there are no hours yet
```

The reconciliation gate asserts against the **database**, not against a figure computed in
the test: it reads every recorded entry for that crew member in the period and requires the
screen and the CSV to agree with it. (Its first version compared against hand-computed
hours and failed on fifteen minutes left by another gate — which is exactly the kind of
difference a payroll report must not paper over.)

#### ⛔ The rate-card editor — not built, pending SETUP D3

**D3 has neither box ticked**, and the stage lists it as a **pre-authorisation** rather
than a preference. The reason is in the feature: an editor that publishes rate-card figures
is the single tool in this system that can change every future price, and `CLAUDE.md` puts
rate-card figures outside what this build may decide. Nothing half-built has been left
behind.

Answer D3 **yes** and it is built to §17.4 — owner only, draft → validate → publish,
immutable versions, `RATE_CARD_VERSION` bumps, existing quotes and subscriptions never
repriced, preview and diff, audit log, one-click rollback, seeded from the code card as
version one, and the agent never publishing changed figures itself. Answer **no** and rates
stay code-only and L10 is finished as it stands.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 491   ℹ pass 490   ℹ fail 0   ℹ skipped 1   # 473 → 491 (+18)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        40 passed (3.1m)                        # 38 → 40 (+2)
```

---

### L11 — Commercial RFQ, invoicing and Bacs

**Started 15 Oct 2026.** Depends on L3 (done). **Three items park on missing
prerequisites**, each verified rather than assumed:

| Item | State | Evidence |
| --- | --- | --- |
| **Bacs mandate and collection** | ⛔ parked | Checked against the live test account, not inferred from the key list: `stripe.setupIntents.create({ payment_method_types: ["bacs_debit"] })` returns *"Your account isn't configured to directly use SetupIntents to create Mandates for Bacs Direct Debits."* `SETUP.md` §3.3 step 2 (Stripe → Settings → Payment methods → enable **Bacs Direct Debit** in test mode) has not been done |
| **Site survey booking link** | ⛔ parked | `NEXT_PUBLIC_CALCOM_URL` is empty (`SETUP.md` §3.10). The RFQ still captures the lead and an admin arranges the survey; what is missing is the self-service link |
| **Invoice PDF storage** | ⛔ parked | Needs R2, which L7 is parked on. Invoices render as a printable page instead, which is what is actually sent — the stored PDF is the archive copy |

Everything else is built. Stage text: PRD §16.3 → L11, §7.6, §12.5.

#### Plan — written before coding

**11.1 Invoicing** — ✅ done
- [ ] **Sequential** invoice numbers with no gaps — a gap in a sales-invoice sequence is
      the first thing an inspector asks about.
- [ ] Net / VAT / gross from the jobs invoiced, reconciling exactly; the **VAT number
      appears only when registered**, because showing one we do not have is an offence and
      omitting one we do have invalidates the invoice for the customer's own return.
- [ ] Net-30 status: issued → due → overdue, from the dates rather than a field someone
      has to remember to change.
- [ ] **Bank transfer appears on invoices only** (§12.5) — never as a checkout option.

**11.2 Commercial contract flow** — ✅ done
- [ ] An RFQ lead becomes a `Proposal` (scope, frequency, price per visit, term), sent to
      the customer, accepted online, and becomes a **real `Subscription` with jobs** —
      through the same code the domestic path uses (L2's gap 1), not a second
      implementation.

**11.3 Organisation as the billing entity** — ✅ done
- [ ] The organisation is who is invoiced; the site contact and the residents are not. A
      block of flats has a managing agent who pays and residents who are present, and
      conflating them is how invoices go to the wrong person.

**11.4 Acceptance (PRD)** — ✅ met (Bacs excepted, parked)
- [ ] A commercial lead reaches an **active recurring contract** end to end.
- [ ] **Invoice totals reconcile to the jobs** invoiced.

#### Work — ✅ complete except the three parked items

**11.2 One implementation of "recurring work".** Accepting a proposal calls the **same**
`createSubscriptionForBooking` the domestic wizard uses. A second implementation would be
a second place for L2's gap 1 to come back — a plan that exists on paper and generates no
cleans — and that gap cost this build a stage to find the first time.

The acceptance page is reachable by someone with **no account**, because that is who
accepts: a managing agent clicking a link. So the proposal id *is* the credential, and the
action is written to that: it accepts only a proposal already marked **sent**, only
**once**, and touches nothing the holder of the link was not already given. A **draft is
not an offer** — the page 404s until an admin sends it, because accepting a draft would
commit us to a price nobody has checked.

**11.1 Invoices that survive being looked at.** Numbers come from the **highest already
issued**, never a count, so a deleted draft cannot reuse one — two invoices sharing a
number is worse than a gap. Gaps are detected and shown on the screen, because an
inspector asks about them and the time to notice is now. State is **derived from the
dates**, so "overdue" cannot be wrong because somebody forgot to change a field, and the
list says *"27 days late"* rather than "overdue" — the first gets a payment, the second
gets ignored. Totals are summed from each job's **stored** figures, so an invoice says
what was charged rather than what today's rate card would make it.

The **VAT number appears only when we are registered**, and a `PLACEHOLDER` value is
treated as absent: showing a VAT number we do not have is an offence, and the screen says
plainly "Not VAT registered — no VAT is charged and none is shown". Bank transfer appears
on invoices **and nowhere else** (§12.5).

#### Evidence — acceptance (PRD §16.3 → L11)

```
$ npm run test:e2e -- commercial
✓ a commercial enquiry becomes an active recurring contract
✓ a draft proposal is not an offer and cannot be seen

$ npx tsx --test src/lib/invoicing.test.ts
ℹ tests 14   ℹ pass 14   ℹ fail 0
```

The first walks it end to end: a commercial `Lead`, a sent `Proposal` showing the price,
the frequency and **the term**, accepted by a signed-out visitor who picks the start date,
producing exactly one active `Subscription` priced from the proposal (not the rate card)
with its first visit in the diary — then an invoice whose totals reconcile to that job,
with no VAT number shown and bank transfer named as the way to pay. Accepting twice
changes nothing.

#### ⛔ Three parked items, each verified rather than assumed

1. **Bacs Direct Debit.** Checked against the live Stripe test account:
   `setupIntents.create({ payment_method_types: ["bacs_debit"] })` returns *"Your account
   isn't configured to directly use SetupIntents to create Mandates for Bacs Direct
   Debits."* `SETUP.md` §3.3 step 2 — enable Bacs in Stripe test mode — has not been done.
   Commercial collection is by invoice and bank transfer meanwhile, which is what §12.5
   has an invoice carry anyway.
2. **The site-survey booking link.** `NEXT_PUBLIC_CALCOM_URL` is empty. The RFQ captures
   the lead and an admin arranges the survey; the self-service link is what is missing.
3. **Invoice PDF storage.** Needs R2, which L7 is parked on. The invoice renders as a page
   — which is what is actually sent — and the stored PDF is the archive copy.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 510   ℹ pass 509   ℹ fail 0   ℹ skipped 1   # 491 → 510 (+19)
$ npm run build           ✓ Compiled successfully
$ npm run test:e2e        42 passed (4.3m)                        # 40 → 42 (+2)
```

---

### L12 — Reviews, growth and content gaps

**Started 15 Oct 2026.** Depends on L9 (done). **One item parks:** `GOOGLE_REVIEW_URL` is
empty, so the Google deep link stands in as a `TODO(business-input)` marker and the review
request asks the customer to reply instead — which the L9 template already does. Stage
text: PRD §16.3 → L12, §10.1, §10.2, §15.

#### Plan — written before coding

**12.1 The schema gaps §15 names** — ✅ done (migration #18)
- [ ] `Review.wasIncentivised`, `Review.incentiveDisclosed`, `Job.isPromotional`,
      `Quote.abandonedAt`, `Quote.recoveryEmailSentAt`.
- [ ] These are **provenance**, not decoration: under the DMCC 2024 an incentivised review
      must say so, and "was this job free or discounted in exchange for a review?" has to
      be answerable from the record rather than from memory.

**12.2 The review engine** — ✅ done
- [ ] Request at 24h (built in L9), **nudge at day 4, then stop**.
- [ ] **No gate.** Everyone who consented is asked, whatever we expect them to say —
      review gating is unlawful under the DMCC 2024 and the code must make it
      *structurally* impossible rather than merely not do it today.
- [ ] A private feedback route **in addition**, never instead: offering "tell us privately"
      as an alternative to a public review is gating with better manners.
- [ ] Trustpilot display only from 20 reviews; the on-site strip already needs ≥10.

**12.3 Abandoned-quote recovery** — ✅ done
- [ ] 2h, then 48h, then stop — and **the PECR basis is recorded per send**. If a send has
      no lawful basis it does not go. A recovery email to someone who never consented and
      is not an existing customer is a breach, however gentle.

**12.4 Referrals and credit** — ✅ done
- [ ] Referral credit applies **automatically at checkout**, which is the acceptance
      criterion — a credit the customer has to remember to claim is a credit that creates
      a complaint.

**12.5 Content** — ✅ nothing published that states an unsupplied fact
- [ ] Any new articles are **unpublished drafts** for Fola; location pages stay behind
      `canPublishLocationPage`; nothing published states a business fact Fola has not
      supplied.

**12.6 Acceptance (PRD)** — ✅ met
- [ ] The request fires at 24h and the nudge is **suppressed once a review exists**.
- [ ] Referral credit applies automatically at checkout.
- [ ] **No location page can publish below the gate.**

#### Work — ✅ stage complete

**12.2 The DMCC rules are structural, not careful.** The Act made two ordinary marketing
habits unlawful, and both are easy to reintroduce by accident:

- **Review gating.** `reviewAction` — the function that decides who gets asked — takes no
  rating, no sentiment, no complaint history. There is nothing to filter on even if
  someone wanted to, and a test asserts the input type stays that way: *if someone adds
  `rating` to `ReviewCandidate`, that test is where the conversation happens.*
- **Undisclosed incentives.** `canDisplay` refuses an incentivised review whose incentive
  is not disclosed — **not** "displays it without the label". The offence is publishing
  it, and a missing label is not something to fix later while the review is live. Two
  fields rather than one, because there are three real states and one boolean cannot
  express the middle: incentivised-and-disclosed, incentivised-and-**not**, and neither.

One nudge at day four, then silence. A third message is not persuasion.

**12.3 The lawful basis is picked per send, and recorded.** A quote is given by someone
who typed their email into a pricing form; that is not consent to marketing. So recovery
goes only where there is **consent** or an **existing customer relationship** (soft
opt-in, PECR reg. 22(3)), the basis is named in the message's own footer, and where
neither holds **nothing is sent** — a row is written saying why, and the quote is marked
handled so it is not reconsidered every two hours.

**12.4 Credit applies automatically**, which is the acceptance criterion and a specific
failure mode: a credit the customer has to claim is a credit that becomes a complaint —
they were told they had £15, they paid full price, somebody refunds it by hand. Credit
never exceeds the bill (it is not cash; a negative charge is a refund nobody authorised),
the **soonest-expiring** credit is spent first (otherwise a customer loses the one that
expires while the other is used), and the draw-down happens **after** the job is persisted
so credit is never consumed by a booking that failed to save. A credit lookup that throws
never blocks a booking: paying full price with the credit intact is recoverable, a lost
booking is not.

#### Evidence — acceptance (PRD §16.3 → L12)

```
$ npx tsx --test src/lib/reviews.test.ts src/lib/credit.test.ts
ℹ tests 21   ℹ pass 21   ℹ fail 0

$ npm run test:e2e -- growth
✓ account credit comes off the price at checkout, without being claimed
✓ credit never exceeds the bill
✓ no location page publishes below the content gate
```

- *"The request fires at 24h and the nudge is suppressed once a review exists"* — both
  asserted directly, along with the stop after one nudge.
- *"Referral credit applies automatically at checkout"* — the gate books through the real
  wizard and asserts the job's price is the quoted price **less the credit**, that the
  card is asked for exactly that, and that the trail says so (its first version asserted a
  tautology; the fixed one compares against the stored quote).
- *"No location page can publish below the gate"* — every area × service combination is
  checked, and any that fails the gate must **404**.

#### One item parked

`GOOGLE_REVIEW_URL` is empty, so the review request asks the customer to reply by email
instead of deep-linking to Google. The marker stands where the link will go; nothing
pretends to have a Google Business Profile that is not yet verified.

#### Evidence — the stage gate

```
$ npx tsc --noEmit        (clean)        $ npx eslint .          (clean)
$ npm test                ℹ tests 531   ℹ pass 530   ℹ fail 0   ℹ skipped 1   # 510 → 531 (+21)
$ npm run build           ✓ Compiled successfully
$ npm run db:drift        -- This is an empty migration.  ✓ no drift
$ npm run test:e2e        45 passed (3.9m)                        # 42 → 45 (+3)
```

**The drift check earned its place again**: migration #18 added two `Quote` columns that a
botched edit had left out of `schema.prisma`, and `npm run db:drift` printed the exact
`ALTER TABLE` that disagreed. That is the check working as designed, on the day it
mattered rather than at the next deploy.
