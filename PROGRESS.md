# PROGRESS.md — mcsecocleaning build log

> **For Fola:** this is the one file to check. The top section shows where things stand and whether anything needs you. **For Claude Code:** this is the only status file you write. Update it after every completed item.

## Status

| | |
| --- | --- |
| **Current stage** | **L2 — ⛔ blocked.** L1 is complete and verified |
| **Next action** | **Fola: fill `.env.local` (SETUP.md §3–§4) and delete the stale `.env`.** Then L2 — baseline the Neon `dev` branch, apply migrations #1–#9 in order, drift check, seed, Playwright, Stripe gates A/B/C. Nothing else can start first: L3–L15 all depend on L2 |
| **Working branch** | `build/autonomous`, cut from `fix/pre-phase3-gate` head `2cfdf3d` (not merged into `main`). 3 commits |
| **Last updated** | 8 Oct 2026 — L1 complete. Trust-claim gate, dev-db guard, outbound guard, launch-inputs check, Next 16 / Prisma 7 deprecations cleared. 190 tests |
| **Needs Fola?** | **Yes — the build is stopped until `.env.local` exists (Q-6).** 7 live *Open questions*; 3 items in the *Review queue* for merge checkpoint 1 |

## Stage tracker

| Stage | Title | Status | Merge checkpoint |
| --- | --- | --- | --- |
| L1 | Reconcile and guardrails | ✅ Done | |
| L2 | Real database and Stripe test-mode gate | ⛔ Blocked — `DATABASE_URL`, `DIRECT_URL`, `DEV_DB_HOST`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `DEV_EMAIL_REDIRECT`, `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY` all absent | ✅ 1 |
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

The branch is 6 commits ahead of `main` and has **never been pushed** — it exists only on this Mac. Nothing in it is on GitHub.

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
- **Admin:** `/admin` counts dashboard only; `/admin/jobs` (complete/capture), `/admin/leads` (convert), `/admin/bookings/new`, `/admin/import`. Access via Auth.js `requireRole`; `src/middleware.ts` is a coarse cookie-presence check only, by design.
- **Customer:** `/account` with pay-outstanding, pause/resume/cancel, marketing preference, property edit (write-only encrypted access codes).
- Owner seeded as `mcsecocleaning@gmail.com`.

### Pre-Phase-3 gate — on the working branch, not on `main`
Six commits: Stripe fixes for flags 1, 2, 3 and 6 plus the flag 4/5 decisions; `b7fb131` explicit "no payment link was created" (`src/lib/admin-booking.ts`); `2cfdf3d` docs. Migrations #7–#9 (`2026-09-30-*`). **Neon:** Fola created the project (London), a `gate` branch and a `psql` connection (PG 18.6), and was setting Vercel env vars. Nothing after that is recorded, and none of it is reachable from this machine — see Q-6.

---

## Environment readiness — **not ready for L2**

| | |
| --- | --- |
| `.env.local` | **Absent.** The ignition prompt assumes it exists and is filled |
| `.env` | Present, git-ignored, **stale**: it is `.env.example` with `DATABASE_URL`/`DIRECT_URL` left at `postgresql://user:password@localhost:5432/...`. `hasDatabase` correctly reads that as "no database", so the app runs DB-less. No real credential is in it and nothing sensitive is committed — `.gitignore` covers `.env*` and only `.env.example` is tracked |
| Neon `dev` branch | Not reachable — no connection string on this machine. `DEV_DB_HOST` unset, so the L1 `assert-dev-db` guard has nothing to compare against |
| Stripe | No key present, test or live |
| `.claude/settings.json` | Created 8 Oct 2026 from `SETUP.md` §5 so the build can run unattended. L1 validates it |

**Consequence for the autonomous run:** L1 needs no keys and can run now. L2 is blocked until `SETUP.md` §3 is done. Stages L3–L13 all depend on L2, so a build started today completes L1 and then stops. Filling `.env.local` is the single highest-value thing Fola can do.

### Keys present (names only, updated each session)

| Stage | Needs | Present? |
| --- | --- | --- |
| L1 | none | ✅ n/a |
| L2 | `DATABASE_URL`, `DIRECT_URL`, `DEV_DB_HOST`, `AUTH_SECRET`, `ACCESS_CODE_ENC_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `DEV_EMAIL_REDIRECT` | ❌ none |
| L7 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_LINK_SECRET` | ❌ none |
| L9 | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_ID` | ❌ none |
| L11 | Stripe Bacs enabled (test), `NEXT_PUBLIC_CALCOM_URL` | ❌ none |
| L12 | `GOOGLE_REVIEW_URL` | ❌ none |
| L14 | `NEXT_PUBLIC_SENTRY_DSN`; Upstash optional | ❌ none |

---

## Gaps found, assigned to stages

Re-measured on 8 Oct 2026. Three entries that the earlier snapshot got wrong are marked **corrected**.

- **L1 — trust claims nobody has confirmed, hardcoded in six files.** "£5m public liability", "DBS-checked" and "Fully insured" appear in `src/app/page.tsx` (trust badges, how-it-works step, FAQ answer), `src/app/about/page.tsx`, `src/components/ui/TrustBar.tsx`, `src/components/layout/Footer.tsx`, `src/config/services.ts` and `src/app/opengraph-image.tsx`. Only `publicLiabilityCover` reads config (`src/config/site.ts`), and that value is a `PLACEHOLDER`. Routing them through config is a prerequisite to gating them.
- **L1 — stale config.** `.env.example` still lists the retired `ADMIN_ACCESS_CODE` (no code reads it since Auth.js) and lacks `APP_ENV`, `AUTH_SECRET`, `DEV_DB_HOST`, `DEV_EMAIL_REDIRECT`, `DEV_SMS_REDIRECT`, `MEDIA_LINK_SECRET`, `NEXT_PUBLIC_ALLOW_INDEXING`. (`README.md` was corrected on 8 Oct — status line and the links to the archived PRD and `BUILD-STATUS.md`.)
- **L1 — business-input markers**: 26 `PLACEHOLDER`, 2 `TODO(business-input)`, 2 `TODO(ops)`, 0 `TODO(pricing)`, 0 `TODO(legal)`, across `src/config/site.ts`, `src/config/availability.ts`, `src/lib/capacity.ts`, `src/lib/pricing/rate-card.ts`, `src/app/cancellation-policy/page.tsx`. `npm run check:launch-inputs` (L1) must find these five files.
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
