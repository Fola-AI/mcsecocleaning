# PROGRESS.md — mcsecocleaning build log

> **For Fola:** this is the one file to check. The top section shows where things stand and whether anything needs you. **For Claude Code:** this is the only status file you write. Update it after every completed item.

## ⛔ STOPPED — 9 Oct 2026 · `.env.local` does not exist

The session that was asked to start L2 could not. **`.env.local` is still absent from the repo root**, so every key L2 needs is missing. Nothing was built; the branch is unchanged except for the documentation repairs logged under *Session — 9 Oct 2026 (L2 attempt)* below.

**The nine keys L2 needs, all absent** (checked by name, 9 Oct 2026 — no `.env.local` file, and none of them set in the shell either):

| Key | What it is | SETUP.md |
| --- | --- | --- |
| `DATABASE_URL` | Neon `dev` **pooled** string (host contains `-pooler`), `&connect_timeout=15` appended | §3.1 |
| `DIRECT_URL` | Neon `dev` **direct** string (pooling off), same suffix | §3.1 |
| `DEV_DB_HOST` | the direct host, the `ep-…` part between `@` and `/` — this is what stops the agent touching any other database | §3.1 |
| `AUTH_SECRET` | `npx auth secret` | §3.5 |
| `ACCESS_CODE_ENC_KEY` | `openssl rand -base64 32` | §3.6 |
| `STRIPE_SECRET_KEY` | `sk_test_…`, **test mode only** | §3.3 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | §3.3 |
| `RESEND_API_KEY` | existing key | §3.4 |
| `DEV_EMAIL_REDIRECT` | Fola's own inbox — every non-production email goes here | §3.4 |

**To clear this stop:** create `.env.local` at the repo root from `SETUP.md` §4, then **delete the stale `.env`** (it still carries the `.env.example` `localhost` placeholder for `DATABASE_URL`/`DIRECT_URL`, and `prisma.config.ts` loads `.env.local` first precisely so that placeholder cannot win — see R-1). Nothing else is blocking.

**Also still blank: SETUP D7** (Q-10). D7 is read, not inferred — all three boxes are unticked. So even once `.env.local` exists, L2 builds gaps 1 and 3 in full and **parks gap 2** (collecting payment once a card hold lapses) as Q-10, exactly as the revised L2 stage instructs. Answering D7 in the same sitting as `.env.local` is what avoids a second parked item.

## Status

| | |
| --- | --- |
| **Current stage** | **L2 — ⛔ blocked, second attempt stopped 9 Oct 2026.** L1 is complete and now independently re-verified on Fola's Mac |
| **Next action** | **Fola: create `.env.local` (SETUP.md §4), delete the stale `.env`, answer SETUP D7.** The nine missing key names are listed under **⛔ STOPPED** above. Then L2 — baseline the Neon `dev` branch, apply migrations #1–#9 in order, drift check, seed, Playwright, Stripe gates A/B/C/D, plus the three Phase 2 gaps from the 9 Oct review (PRD §16.1). Nothing else can start first: L3–L15 all depend on L2 |
| **Working branch** | `build/autonomous` on GitHub — the fix-branch work plus 4 L1 commits and the 9 Oct documentation repair, 11 commits ahead of `main` (not merged) |
| **Last updated** | 9 Oct 2026 (second entry) — L2 attempt stopped on the missing `.env.local`; verify gate re-run green on Fola's Mac (190 tests); files deleted from the working tree restored; Q-13 raised on where the build documents live. Earlier 9 Oct — external review, documents revised to PRD v2.2.1. 8 Oct — L1 complete |
| **Needs Fola?** | **Yes — two things, and the build cannot move without the first.** (1) `.env.local` (Q-6). (2) SETUP D7 (Q-10), or L2's gap-2 work parks. 11 live *Open questions*; 3 items in the *Review queue* for merge checkpoint 1 |

## Stage tracker

| Stage | Title | Status | Merge checkpoint |
| --- | --- | --- | --- |
| L1 | Reconcile and guardrails | ✅ Done | |
| L2 | Real database and Stripe test-mode gate (+ Phase 2 gaps 1–3, gate D — added 9 Oct) | ⛔ Blocked — `DATABASE_URL`, `DIRECT_URL`, `DEV_DB_HOST`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `DEV_EMAIL_REDIRECT`, `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY` all absent | ✅ 1 |
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

## Environment readiness — **not ready for L2**

| | |
| --- | --- |
| `.env.local` | **Absent — re-checked 9 Oct 2026, still not there.** The ignition prompt assumes it exists and is filled. This is the whole of the blockage |
| `.env` | Present, git-ignored, **stale**: it is `.env.example` with `DATABASE_URL`/`DIRECT_URL` left at `postgresql://user:password@localhost:5432/...`. `hasDatabase` correctly reads that as "no database", so the app runs DB-less. No real credential is in it and nothing sensitive is committed — `.gitignore` covers `.env*` and only `.env.example` is tracked |
| Neon `dev` branch | Not reachable — no connection string on this machine. `DEV_DB_HOST` unset, so the L1 `assert-dev-db` guard has nothing to compare against |
| Stripe | No key present, test or live |
| `.claude/settings.json` | Created 8 Oct 2026 from `SETUP.md` §5 so the build can run unattended. L1 validates it |

**Consequence for the autonomous run:** L1 needs no keys and can run now. L2 is blocked until `SETUP.md` §3 is done. Stages L3–L13 all depend on L2, so a build started today completes L1 and then stops. Filling `.env.local` is the single highest-value thing Fola can do.

### Keys present (names only, updated each session)

| Stage | Needs | Present? |
| --- | --- | --- |
| L1 | none | ✅ n/a |
| L2 | `DATABASE_URL`, `DIRECT_URL`, `DEV_DB_HOST`, `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `DEV_EMAIL_REDIRECT` | ❌ **none — all nine, re-checked 9 Oct 2026.** Named individually under **⛔ STOPPED** |
| L7 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_LINK_SECRET` | ❌ none |
| L9 | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_ID` | ❌ none |
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

- **Q-6** · L2 and everything after · **`.env.local` does not exist on this machine.** `SETUP.md` §3 has not been completed here, so there is no Neon `dev` connection string, no `DEV_DB_HOST`, no Stripe test key, no `AUTH_SECRET`. Options: complete `SETUP.md` §3 now / let the build run L1 only and stop. **Blocks: L2 and, transitively, L3–L15.** Nothing else Fola can do matters as much as this one.
- **Q-1** · all · Eco positioning weight (PRD §16.7 #1, SETUP D6). Options: primary from day one / phase-two differentiator. Blocks: nothing in code; affects copy emphasis.
- **Q-2** · L4 · ~~Employee or self-employed crews (SETUP D2).~~ **Answered 8 Oct 2026: not decided — build both.** L4 builds and tests `assign` and `offer`; the production config value is chosen before launch. The underlying employment-status question (PRD §14.6, §16.7 #2) still affects the cost floor and so Q-4.
- **Q-3** · L1 · Trust facts: are crews DBS-checked, and what public liability cover is actually held, with which insurer? Until confirmed, L1 hides both claims across all seven files. Blocks: nothing; the claims simply stay hidden. Note the site currently asserts both to the public.
- **Q-8** · L1 · **The T&Cs assert insurance we have not confirmed.** `src/app/terms/page.tsx` §7 reads "We carry public liability and, where relevant, treatment/care-custody-and-control and employers' liability insurance." L1 gated the same claim everywhere else, but changing legal wording is a Park item (`CLAUDE.md` → *Decision boundary*), so this was left alone and exempted from the claim scan. Options: confirm the cover and the sentence stands / amend the wording with an adviser / remove §7 until confirmed. Blocks: nothing in code. **This is live on the site today.**
- **Q-9** · launch · **`VAT_DISPLAY_MODE` has never been chosen.** `src/lib/money.ts` defaults to `"absorb"` when unset, so today every published price stays put on VAT registration and the VAT comes out of margin. The alternative, `"add"`, treats rate-card figures as net and raises every headline price by the VAT rate. L1 documented the variable in `.env.example` without changing the default. Options: absorb / add. Blocks: nothing now; it changes every consumer price the day `VAT_REGISTERED` flips, so decide it with Q-4.
- **Q-4** · launch · Cost-per-crew-hour model (§16.7 #8) may change rate-card figures. Blocks: launch pricing sign-off only.
- **Q-5** · launch · Company facts for `src/config/site.ts` (SETUP §6) — 26 placeholders. Blocks: the L15 release gate (`npm run check:launch-inputs`).

- **Q-10** · L2 · **How to collect payment once a card hold lapses** — bookings more than ~7 days ahead and every recurring visit (finding 2). Options are in SETUP D7: A save card + charge off-session on completion / B save card + place the hold ~2 days before / C additionally cap one-off bookings at ~6 days ahead. Blocks: the L2 collection item and gate D's payment step only; the rest of L2 proceeds.
- **Q-11** · L2 · **Quote validity period.** PRD §7.2 says 14 days; the code stores 30 (`src/app/actions/booking.ts:362`). Options: change the code to 14 / amend the PRD to 30. Blocks: nothing; it sets how long a quoted price is honoured.
- **Q-13** · all · **Where the five build documents live.** They were moved into `docs/` on 9 Oct 2026 along with the v2.2.1 revision, but `CLAUDE.md` itself still states (line 24) that the five live at the **repo root**, and decision D-0a records why: *Claude Code only auto-reads `CLAUDE.md` from the repo root*. That is not theoretical — this session was **not** given `CLAUDE.md` automatically and had to be pointed at `docs/CLAUDE.md` by hand. A future session started without that instruction runs with no rulebook and would not know it. The agent may not edit `CLAUDE.md`, so the contradiction is parked rather than resolved. Options: **(a)** move the five back to the repo root, keeping the v2.2.1 content — restores auto-loading and matches `CLAUDE.md` as written; **(b)** keep them in `docs/` and amend `CLAUDE.md` line 24 and D-0a, accepting that every future session must be told where the rulebook is. `README.md`'s links were repointed at `docs/` so the repo is at least self-consistent today; under option (a) that is one edit back. Blocks: nothing in code — but it decides whether the next unattended session reads the rules at all.
- **Q-12** · L7 · **Media retention.** `.env.example` pre-fills `MEDIA_RETENTION_MONTHS="12"` while SETUP D4 is blank, so L7 would ship 12 months by default. Options: 12 / 18 / 24 months (answer D4). L7 reads D4, not the example default; until D4 is answered the retention value is parked. Blocks: L7 retention only.

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
