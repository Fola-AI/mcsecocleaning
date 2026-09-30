# Deployment

Target: **Vercel (London / lhr1)** for the app, **Postgres in eu-west-2**
(Neon or Supabase). Ship Phase 1 to production early — the SEO clock starts when
the site is indexed (§13 rule 5).

## 1. Repository
Already wired to `git@github.com:Fola-AI/mcsecocleaning.git`. Push `main`.

## 2. Vercel
1. Import the GitHub repo into Vercel.
2. Framework preset: Next.js (auto). Region: **London (lhr1)**.
3. Add environment variables from `.env.example` (see below).
4. Deploy. Vercel gives preview deploys per PR.

## 3. Environment variables
Set in Vercel (Production + Preview). Never commit real secrets (§9.2).

| Var | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical URLs, sitemap | e.g. `https://www.mcsecocleaning.co.uk` |
| `DATABASE_URL`, `DIRECT_URL` | Prisma | pooled + direct (Neon/Supabase) |
| `VAT_REGISTERED` | pricing | `false` until HMRC-registered |
| `NEXT_PUBLIC_GA_ID` | analytics | loads only after consent |
| `RESEND_API_KEY`, `EMAIL_FROM`, `LEADS_INBOX` | email | |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | scheduler | from Inngest dashboard |
| `TWILIO_*` | SMS (Phase 2+) | alphanumeric sender ID |
| `STRIPE_*` | payments (Phase 2) | |
| `R2_*` | media (Phase 5) | |
| `ACCESS_CODE_ENC_KEY` | access codes (Phase 3) | 32-byte base64 |
| `NEXT_PUBLIC_SENTRY_DSN` | monitoring | |

## 4. Database
```bash
# From a machine with DATABASE_URL/DIRECT_URL set:
npm run db:push      # or: npm run db:migrate for a migration history
npm run db:seed      # service types, areas, gated location pages
```
Enable managed backups + PITR and **test a restore** before launch (§9.2).

### 4a. Manual migrations — run BEFORE the deploy that needs them, never after
`prisma db push` (§4) creates a **fresh** schema fully, so on a new database the
files in `prisma/manual-migrations/` are not needed. They exist to evolve a
database that **already holds rows**, and the build does **not** run them
(`build` = `prisma generate && next build`). Rule: **apply the SQL first, then
deploy** — never the reverse, regardless of current DB state. Deploying code that
writes a value the DB doesn't have yet is caught by app-level try/catch, so it
doesn't crash — it **silently fails to persist** and only emails the team, which
is quiet data loss.

- **`2026-09-19-service-area-patch-group.sql`** — `ServiceArea.patchGroup`.
- **`2026-09-20-lead-converted-quote-and-domestic-sales.sql`** — `Lead.convertedQuoteId`
  + `LeadType.domestic_sales`. **MUST run against prod's DB before (or with) the
  first deploy where `hasDatabase` is true.** Until a DB is connected the code is
  inert (lead writes are skipped), but the gap opens the moment a DB is attached
  if the enum value isn't there first. Run `ALTER TYPE … ADD VALUE` **standalone**
  (not inside a transaction).
- **`2026-09-20-quote-manual-override.sql`** — `Quote.manualOverride` +
  `overrideReason` + `overrideBy` (§9.7 override log). Additive; run before the
  first DB-backed deploy that includes admin lead-conversion / manual pricing.
- **`2026-09-24-payments-reconciliation-webhook-status.sql`** — `Payment.stripeChargeId`
  + `stripeRefundId`, and `WebhookEvent.status` (`WebhookStatus`) + `processedAt`.
  Additive; run before the first DB-backed deploy that includes the payments flow.
- **`2026-09-27-payment-status-part-paid.sql`** — `PaymentStatus.part_paid` (split-payment
  Job.paymentStatus). Additive `ADD VALUE`; run before the first DB-backed deploy
  that includes the deposit branch.
- **`2026-09-28-authjs-tables.sql`** — Auth.js `Account` / `Session` /
  `VerificationToken` tables + `User.emailVerified` / `User.image`. Additive; run
  before the first DB-backed deploy that includes Auth.js RBAC.
- **`2026-09-30-user-stripe-customer-id.sql`** — `User.stripeCustomerId` + unique
  index (one Stripe Customer per user, so the deposit's card can authorise the
  balance). Additive, re-runnable; run before the first DB-backed deploy that
  includes the Stripe Customer change.
- **`2026-09-30-payment-status-released.sql`** — `PaymentStatus.released` (a charge
  we cancelled with its booking; no money moved). Additive `ADD VALUE`, run it on its
  own (no `-1`); run before the first DB-backed deploy that includes Cancel & refund.
- **`2026-09-30-payment-checkout-session-id.sql`** — `Payment.stripeCheckoutSessionId`
  (the handle that expires an unpaid payment link on cancellation). Additive,
  re-runnable; run before the first DB-backed deploy that includes the payment-link /
  re-charge reconciliation fix.

### 4b. Payments (Stripe) — required ops setup before payments can go live
Same go-live checklist status as the migrations above — neither gets assumed done.
Until these are set, `stripeConfigured()` is false: booking works but **no card is
taken** (no PaymentIntent, no `Payment` row authorised), which is the current dev
state.
- **`STRIPE_SECRET_KEY`** — the API key (test key in staging, live key in prod).
- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** — the publishable key (client-safe) the
  booking payment step mounts Stripe Elements with. Absent → the payment step shows
  a "we'll be in touch" fallback and no card is taken.
- **`STRIPE_WEBHOOK_SECRET`** — the signing secret for the endpoint below; without
  it the webhook rejects every event (400), so captures/refunds never reconcile.
- **Dashboard webhook endpoint** → `https://<domain>/api/stripe/webhook`,
  subscribed to `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`.
- **End-to-end test-key pass (GATE — unverified until done).** The client Stripe
  flow has not been run against live Stripe. Before go-live, in Stripe **test
  mode**, confirm end to end: (a) a **large job** — deposit captured + balance
  authorised on the SAME card (PaymentMethod reuse), including the 3-D Secure
  challenge path; then capture the balance on completion; (b) a **full-amount
  job** — authorise then capture; (c) a **refund/cancel** within the cooling-off
  window releases the balance and refunds the deposit. This is a gate, not a
  reminder — payments do not go live until it passes.

### 4c. Auth (Auth.js RBAC) — required before the admin area works
Replaces the interim shared-code gate; magic-link sign-in gated by `User.role`.
- **`AUTH_SECRET`** — required by Auth.js to sign/encrypt session tokens (generate
  with `npx auth secret`). Without it, sign-in fails.
- **`RESEND_API_KEY`** + **`EMAIL_FROM`** — the magic-link email is sent via Resend
  (same as transactional email, §5). Without a key, no link is delivered.
- **Seed the owner + any admin users** — `npm run db:seed` creates the `owner`
  user (email supplied by the business); only seeded roles can reach `/admin`.
  A user with no row, or role `customer`, is denied.

## 5. Email deliverability (do before sending anything real)
Configure **SPF, DKIM and DMARC** for the sending domain in Resend and warm the
domain. Booking confirmations landing in spam is a business-ending failure (§9.2).

## 6. Inngest (durable scheduler)
1. Create an Inngest app; set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
2. Register the serve URL: `https://<domain>/api/inngest`.
3. Verify the `scheduler-heartbeat` cron runs and logs (Phase 1 acceptance). Fire
   a `test/heartbeat` event to check the pipeline on demand.

## 🚨 Launch gate — noindex is enforced by the build, not a checklist
The whole site ships **noindex** (meta robots + `robots.txt` Disallow: /) unless
`NEXT_PUBLIC_ALLOW_INDEXING === "true"`. Correct for the *.vercel.app test deploy;
business-ending if it reached the real public domain unchanged.

This is **enforced at build time** (`src/lib/seo/indexing-guard.ts`, called from
`next.config.ts`): a Vercel **production** deploy whose production domain is a real
custom domain (not `*.vercel.app`) **fails the build** while `NEXT_PUBLIC_ALLOW_INDEXING`
is not `"true"`. A checklist item does not survive a late deploy; a failed build does.

So, at public launch, set on the production domain:
- `NEXT_PUBLIC_ALLOW_INDEXING="true"` — required, or the build fails
- `NEXT_PUBLIC_SITE_URL` = the real domain (fixes canonicals + sitemap host)

Only after the NAP placeholders in `src/config/site.ts` are real. After deploy,
confirm `robots.txt` allows `/` and the homepage meta reads `index, follow`.

## 7. Post-deploy SEO
- Submit `sitemap.xml` in Google Search Console; verify the property.
- Confirm `robots.txt`, `llms.txt`, canonical tags and JSON-LD render.
- Run PageSpeed Insights on mobile; confirm **LCP < 2.5s, INP < 200ms, CLS < 0.1**.
- Ensure `/book`, `/account/*`, `/admin/*`, `/crew/*` are noindex.

## 8. Monitoring
Add Sentry (`@sentry/nextjs`) and an uptime monitor. Wire `NEXT_PUBLIC_SENTRY_DSN`.
(Tracked as a launch-hardening task, §Phase 6.)
