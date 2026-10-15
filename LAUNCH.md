# LAUNCH.md — taking mcsecocleaning live

**Written at stage L15, 15 October 2026, from `build/autonomous`.** Everything here
is for **you** to run. The build agent has never touched production and cannot: the
`db:*` scripts refuse any host that is not the Neon `dev` branch, so where this
document needs to reach a real database it uses `psql` directly or the one entry
point written for you (§1.3).

Read §0 first. Three of its items are **blocking**, and one of them is the reason
this document exists in a repository that is otherwise ready.

---

## 0. Before you start — what is not done

### 0.1 BLOCKING · 39 placeholders and 4 unconfirmed trust claims

The whole release gate is one command. It runs the five code gates in order and
finishes with the one that is currently red:

```bash
npm run release:gate
```

That is `typecheck → lint → unit tests → build → end-to-end → check:launch-inputs`,
stopping at the first failure. The first five are green on this branch. The last
one is not, and it is the only thing between this repository and a launch:

```bash
npm run check:launch-inputs
```

It prints every marker and exits non-zero while any remain. Today:

| Marker | Count | What it is |
| --- | --- | --- |
| `PLACEHOLDER` | 29 | **26 in `src/config/site.ts`** — trading name, registered name and number, registered address, phone, email, NAP, social links, domain. Plus 2 in `src/lib/pricing/rate-card.ts` (the card is **pre-cost-model**, Phase 0 §16) and 1 in `src/lib/invoicing.ts` (the VAT number, which is omitted from an invoice while it reads PLACEHOLDER) |
| `TODO(business-input)` | 6 | The three insurance / DBS claims, D2's assignment mode, and two config headers |
| `TODO(legal)` | 2 | The card-on-file consent wording (**Q-14**) — unapproved, so card on file is switched off |
| `TODO(ops)` | 2 | The default roster and the travel-buffer defaults |
| **Total** | **39** | Plus 4 unconfirmed trust claims, which are withheld from the site rather than blocking it |

The 26 in `src/config/site.ts` are **PROGRESS.md Q-5**, and nothing else on this list
matters until they are real: the NAP must match your Google Business Profile
character for character, every page, email and schema block reads them from that one
file, and a launch with "PLACEHOLDER — confirm registered name" in the footer is
worse than a launch a week later.

**Do not** edit them anywhere but `src/config/site.ts`. A test fails if a business
fact is typed into a page or a component.

### 0.2 BLOCKING · the Stripe test-mode pass by hand

`npm run test:e2e` confirms 71 gates against Stripe **test mode**, including a real
3-D Secure challenge — but it confirms cards through Stripe's **API**, because the
Payment Element is drawn on a canvas and cannot be typed into by automation
(PROGRESS.md D-14). Nobody has ever typed a card number into this site.

Before you take a real payment, in test mode, in a browser, as a customer:

1. A large job: deposit captured and balance authorised on the **same** card,
   through the 3-D Secure challenge; then mark the job complete and watch the
   balance capture.
2. A full-amount job: authorise at booking, capture on completion.
3. A cancellation inside the cooling-off window: deposit refunded, hold released.

`docs/DEPLOYMENT.md` §4b is the same list with more detail. It is a gate, not a
reminder.

### 0.3 BLOCKING · back up and test a restore

Enable Neon's managed backups and PITR on the production branch and **restore one**
somewhere harmless before you depend on it (§9.2). An untested backup is a belief.

### 0.4 Two stages are parked, and that is a launch decision

| Stage | What is missing | What the site does without it |
| --- | --- | --- |
| **L7 — media exchange** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, plus SETUP **D4** | No before/after photos: crews cannot upload, customers cannot see them, and the checklist's "photo required" items cannot be satisfied with a photo. Everything else about a job works |
| **L10 — rate-card editor** | SETUP **D3** | You cannot change prices in the admin UI. Prices come from `src/lib/pricing/rate-card.ts`, so a change is a code edit and a deploy — fine at launch, painful by the third change |

Launching without either is a defensible choice. Launching without knowing you are
is not, which is why they are here.

### 0.5 Unanswered decisions that change behaviour

- **D5 — rate-limiting backend.** Postgres is built and working. If you want
  Upstash, it is an adapter and two keys (`UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`); nothing at the call sites changes.
- **D2 — assignment mode.** Both "assign" and "offer" are built; the default is in
  `src/config/*` with a `TODO(business-input)`.
- **Q-9 — `VAT_DISPLAY_MODE`.** Currently `absorb`. When you register for VAT, this
  decides whether every headline price moves. Read it before you set
  `VAT_REGISTERED=true`.
- **Q-14 — card-on-file wording.** Until the wording in `src/config/legal.ts` is
  marked confirmed, a booking more than six days ahead takes no card at booking and
  asks for payment on completion instead.
- **Q-17 — holiday entitlement.** Days taken are recorded; no entitlement is
  calculated.

---

## 1. The database — migrate **before** you deploy

Production is a **separate Neon branch**. Create it from the Neon console, not from
this repository.

The repository holds 19 hand-written migrations in `prisma/manual-migrations/`,
applied **in filename order**. They exist to evolve a database that already holds
rows. On a genuinely empty production branch you have a choice:

- **Empty branch:** `npx prisma db push` creates the whole schema, and the 19 files
  are unnecessary. Simpler, and what you want if production starts empty.
- **A branch with rows** (you have already launched, or you copied `dev`): apply the
  files in order. Never the reverse order, and never after the deploy that needs
  them — code that writes a column the database lacks does not crash, it silently
  fails to persist, which is quiet data loss.

### 1.1 Applying them by hand

`npm run db:migrate:manual` is **refused** against anything but `dev` by design, so
run `psql` directly, in this order, with `DIRECT_URL` set to the production
**direct** (non-pooled) host:

```bash
for f in prisma/manual-migrations/*.sql; do
  echo "→ $f"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -1 -f "$f" || break
done
```

**Six files must run WITHOUT `-1`** — Postgres refuses `ALTER TYPE … ADD VALUE`
inside a transaction block:

```
2026-09-20-lead-converted-quote-and-domestic-sales.sql
2026-09-24-payments-reconciliation-webhook-status.sql
2026-09-27-payment-status-part-paid.sql
2026-09-30-payment-status-released.sql
2026-10-15-access-code-audit-outcome.sql
2026-10-15-crew-pin-and-issue-types.sql
```

For those six, drop the `-1`:

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/manual-migrations/<file>.sql
```

(`scripts/db-migrate-manual.ts` decides this automatically from the file's contents
and `scripts/db-migrate-manual.test.ts` pins which six they are — if that list ever
disagrees with this one, the test is right.)

### 1.2 Confirm the schema, don't assume it

```bash
# The one that matters: must print exactly "-- This is an empty migration."
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Anything else means production and `schema.prisma` disagree — **stop and fix it
before deploying.** This check caught a real mistake during the build (two columns
added in SQL and missing from the schema), which is the reason it is a gate.

Spot checks that answer "did the interesting ones land?":

```sql
-- the enums that ALTER TYPE added
SELECT unnest(enum_range(NULL::"PaymentStatus"));   -- expect part_paid, released
SELECT unnest(enum_range(NULL::"LeadType"));        -- expect domestic_sales
-- the tables the later stages added
SELECT to_regclass('"NotificationLog"'), to_regclass('"RateLimitCounter"'),
       to_regclass('"AccessCodeAudit"'), to_regclass('"CrewUnavailability"');
-- access-code audit records refusals as well as reveals
SELECT column_name FROM information_schema.columns
WHERE table_name = 'AccessCodeAudit' AND column_name = 'outcome';
```

### 1.3 Seed, then check the owner

Every `db:*` script and `prisma/seed.ts` refuse any database but the Neon `dev`
branch, by design — that is what stopped the build agent reaching a real one, and
it is not being weakened for launch day. Production has its own door, which asks
you to mean it:

```bash
APP_ENV=production \
CONFIRM_PRODUCTION_SEED=yes \
OWNER_EMAIL=the-email-you-actually-use@example.com \
DATABASE_URL="<production pooled>" \
DIRECT_URL="<production direct>" \
npm run db:seed:production
```

It prints the host and the owner email **before** writing anything — read both
lines. It refuses if `CONFIRM_PRODUCTION_SEED` is not exactly `yes`, if `APP_ENV`
is not `production`, or if the host is the one in `DEV_DB_HOST` (a "production"
seed aimed at dev is a mistake every time).

It writes reference data only, all upserts, so it is safe to re-run: the owner,
service types, add-ons, checklist templates, service areas and the gated location
pages. No customer, no job, no money. `prisma/seed-dev.ts` — the one that invents
twenty customers — is not reachable from it.

`OWNER_EMAIL` matters: without it the owner is the committed default
(`mcsecocleaning@gmail.com`), which is a business fact nobody has confirmed. Only a
seeded role reaches `/admin`, so check it:

```sql
SELECT email, role FROM "User" WHERE role IN ('owner','admin','supervisor');
```

**Never** run `prisma migrate reset`, `db push --accept-data-loss` or
`npm run db:seed:dev` against production. The last of those invents twenty
customers, fifty jobs and three crews with a known PIN.

---

## 2. Vercel production environment

Set these on the **Production** environment (region `lhr1`). Names only — put no
value in this file, in the repository, or in a chat.

**Required, or the app is broken or unsafe:**

| Name | Note |
| --- | --- |
| `APP_ENV` | `production`. **This is the switch that stops email and SMS being redirected.** Below it, every message goes to `DEV_EMAIL_REDIRECT` / `DEV_SMS_REDIRECT` |
| `NEXT_PUBLIC_SITE_URL` | the real domain — canonicals and the sitemap host |
| `NEXT_PUBLIC_ALLOW_INDEXING` | `true` at public launch. **The build FAILS without it on a real custom domain** (`src/lib/seo/indexing-guard.ts`) |
| `DATABASE_URL` | production pooled string |
| `DIRECT_URL` | production direct string (migrations and the drift check) |
| `AUTH_SECRET` | `npx auth secret` |
| `RESEND_API_KEY`, `EMAIL_FROM`, `LEADS_INBOX` | magic links and every transactional email |
| `STRIPE_SECRET_KEY` | **live** key — `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live publishable key |
| `STRIPE_WEBHOOK_SECRET` | the signing secret of the production endpoint (§3) |
| `ACCESS_CODE_ENC_KEY` | 32 bytes, base64: `openssl rand -base64 32`. **Lose this and every stored access code is unreadable.** Keep a copy in your password manager before you set it |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | §5. Without the signing key `/api/inngest` accepts unsigned requests — and that endpoint runs functions |

**Set if you are using the feature:**

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_ID` (SMS; without them a
text is logged, never sent) · `TWILIO_WEBHOOK_URL` (only if inbound-SMS signature
verification fails behind the proxy) · `R2_*` + `MEDIA_LINK_SECRET` (L7, parked) ·
`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (§6) · `NEXT_PUBLIC_GA_ID` ·
`GOOGLE_REVIEW_URL` (the review request deep-links instead of asking for a reply) ·
`NEXT_PUBLIC_CALCOM_URL` (self-service site surveys) · `UPSTASH_REDIS_REST_*` (only
if D5 = Upstash) · `VAT_REGISTERED`, `VAT_DISPLAY_MODE` (read Q-9 first).

**Never set in production:** `DEV_DB_HOST`, `DEV_EMAIL_REDIRECT`,
`DEV_SMS_REDIRECT`, `INNGEST_DEV`, `CARD_ON_FILE_DEV_PREVIEW`. The last one cannot
turn card-on-file on in production even if you set it (`cardOnFileEnabled` requires
`APP_ENV !== "production"`, and `src/lib/collection.test.ts` asserts it), but it has
no business being there. `DEV_DB_HOST` is the one that matters most: with it set,
the `db:*` scripts stop refusing.

---

## 3. Stripe — live mode

1. Switch the dashboard to live mode and copy the live keys into §2.
2. **Webhook endpoint:** `https://<domain>/api/stripe/webhook`, subscribed to
   exactly these six events:
   ```
   payment_intent.amount_capturable_updated
   payment_intent.succeeded
   payment_intent.payment_failed
   payment_intent.canceled
   charge.refunded
   setup_intent.succeeded
   ```
   `setup_intent.succeeded` is the one people forget. It is how a saved card is
   recorded against the customer; without it a booking more than six days ahead
   saves a card nobody knows about and quietly falls back to a payment-request
   email. The same list is forwarded locally by `scripts/e2e.ts`, so the two stay in
   step.
3. Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Bacs** (commercial Direct Debit) is **not** enabled on the account — checked
   against the live API during L11, not assumed. Until you enable it, commercial
   invoices offer bank transfer. Enabling it is a Stripe-side application.
5. Statement descriptor: set it to something a customer will recognise on a bank
   statement. An unrecognised descriptor is a chargeback.

---

## 4. Domain, DNS and email deliverability

1. Add the domain in Vercel and point DNS at it.
2. `NEXT_PUBLIC_SITE_URL` and the NAP in `src/config/site.ts` must agree with it.
3. **SPF, DKIM and DMARC** for the sending domain, in Resend, before you send
   anything real — then warm the domain gently. Booking confirmations in the spam
   folder is a business-ending failure, and it is silent.
4. Note the current Resend account limit (**PROGRESS.md Q-16**): until a domain is
   verified, Resend will only deliver to the account's own address. Verify the
   domain *before* launch or no customer receives anything.
5. Send yourself one of each: booking confirmation, magic link, visit reminder,
   review request. Check the "from" name, the reply-to, and the unsubscribe link.

---

## 5. Inngest (the scheduler)

1. Create a production Inngest app; set `INNGEST_EVENT_KEY` and
   `INNGEST_SIGNING_KEY`.
2. Register the serve URL: `https://<domain>/api/inngest`.
3. Confirm the functions appear and that `scheduler-heartbeat` has run.
4. Fire a `test/heartbeat` event to check the pipeline end to end.

Twelve functions are registered. The ones whose silence would cost you money:
`materialise-subscriptions` (recurring visits stop appearing),
`nudge-incomplete-deposits`, `send-visit-reminders`, `send-review-requests`,
`recover-abandoned-quotes`, `sweep-verification-tokens` and
`sweep-rate-limit-counters`. Inngest shows the last run of each — a cron that has
never run is the failure to look for, and it is silent.

---

## 6. Monitoring

Server errors are already reported: `src/instrumentation.ts` writes one **redacted**
JSON line per error to the Vercel function log, through `src/lib/monitoring.ts`.
Nothing further is required for launch, and no access code, key, token, session
cookie or email local part reaches a log line (`src/lib/monitoring.test.ts`).

For alerting rather than archaeology, create a Sentry project, set
`NEXT_PUBLIC_SENTRY_DSN` and call the SDK from `reportError` — the one place it
goes. Until then, read the function log, and watch for lines tagged
`[error] {"source":"webhook:stripe"` — a failed webhook is money that has not
reconciled.

---

## 7. Launch day, in order

```
 1. §0 blockers cleared, placeholders real, check:launch-inputs green
 2. production Neon branch created, backups on, a restore tested
 3. migrations applied, drift check prints an empty migration
 4. seed run, owner row confirmed
 5. §2 env vars set on Production (NEXT_PUBLIC_ALLOW_INDEXING=true last)
 6. Stripe live keys + webhook endpoint + the six events
 7. DNS, SPF/DKIM/DMARC, domain verified in Resend
 8. Inngest app registered, heartbeat seen
 9. merge build/autonomous → main, deploy
10. §8 smoke tests, on the live domain
11. Search Console, sitemap, Google Business Profile booking link
```

Steps 3 and 5 are the ones that must not swap: **migrate before the deploy.**

---

## 8. Smoke tests on the live site

Do all of these yourself, in a browser, on the real domain. Each one has failed
somewhere in this build's history, which is why it is on the list.

1. **Homepage** — loads, phone number correct, no "PLACEHOLDER" anywhere. View
   source: `robots` reads `index, follow`, and `/robots.txt` allows `/`.
2. **A real quote** — `/book`, pick a service, see a price. It must match
   `/prices`. Consumer prices are VAT-inclusive; there must be no "+ VAT" anywhere.
3. **A real booking with your own card** — then refund it from the admin area. This
   is the test that proves the live keys, the webhook and the capture path together.
4. **The confirmation email** arrived, with the pre-contract information and the
   14-day cancellation rights.
5. **Admin** — sign in with the owner magic link; `/admin` shows today.
6. **Crew** — `/crew/signin` on a phone, with a real PIN you set; the assigned job
   appears and no price does.
7. **An access code** — set one on a property, reveal it as the assigned crew
   inside the window, then confirm `AccessCodeAudit` has the row. Try it as
   unassigned crew and confirm the refusal is logged too.
8. **A location page** — one that passes the publish gate renders; one that does not
   is absent rather than thin.
9. **Unsubscribe** — click it in a real email; `User.marketingConsent` goes false.
10. **Text STOP** (if Twilio is live) — the same field goes false.

---

## 9. Rollback

**The code:** redeploy the previous deployment from the Vercel dashboard. It is one
click and it is the fastest thing you can do.

**The database: do not roll back casually.** Every migration in this set is
additive — new tables, new nullable or defaulted columns, new enum values — so
*old code runs fine against the new schema*. Redeploying old code therefore needs no
database change, which is the whole reason the migrations were written that way.

Enum values cannot be removed in Postgres without rewriting the type, and a column
holding real rows should not be dropped to undo a deploy. If you genuinely must undo
a schema change, restore the Neon branch to a PITR point before it — and accept
losing everything written since.

**If payments misbehave:** the safe move is to disable the Stripe webhook endpoint
(stops reconciliation, nothing is lost — events are retried for days) rather than
rotating the keys, which breaks bookings in flight.

**If something is leaking data:** `NEXT_PUBLIC_ALLOW_INDEXING` back to `false` and
redeploy takes the whole site out of the index.

---

## 10. The first week

**Every day:**

- The Vercel function log for `[error]` lines, especially `source:"webhook:stripe"`.
- Stripe: any payment in `requires_capture` past its job date, and any failed
  charge. `/admin/payments` ranks failures first.
- `/admin` today view: every job has a crew, and yesterday's are all closed off.

**Twice in the week:**

- A `WebhookEvent` row with `status = 'failed'` is money that has not reconciled:
  ```sql
  SELECT id, type, status, "receivedAt", "processedAt" FROM "WebhookEvent"
  WHERE status <> 'processed' ORDER BY "receivedAt" DESC LIMIT 20;
  -- 'received' with a NULL processedAt means the handler never ran at all.
  ```
- Recurring visits are being created:
  ```sql
  SELECT s.id, s.frequency, COUNT(j.id) AS jobs
  FROM "Subscription" s LEFT JOIN "Job" j ON j."subscriptionId" = s.id
  WHERE s.status = 'active' GROUP BY s.id, s.frequency;
  ```
- Access-code audit, including refusals:
  ```sql
  SELECT outcome, COUNT(*) FROM "AccessCodeAudit"
  WHERE "accessedAt" > now() - interval '7 days' GROUP BY outcome;
  ```
- Nobody legitimate is being rate-limited:
  ```sql
  SELECT split_part(key, ':', 1) AS rule, COUNT(*)
  FROM "RateLimitCounter" WHERE count > 10 GROUP BY 1;
  -- An hourly sweep keeps 24 hours, so this is "yesterday and today".
  ```

**Once, at the end of the week:**

- Search Console: the sitemap is read, pages are indexed, no coverage errors.
- A customer who booked can sign in to `/account` and see their booking.
- Read `docs/SECURITY-REVIEW.md` §9 and §10 — the residual risks, including the CSP
  trade — and decide which of them you now want closed.
- Book the penetration test (§13.3). It is the one audit this build could not do to
  itself.

---

## 11. What is still owed to this document

- **A full regression on a Vercel preview.** `npm run test:e2e` is green locally
  (71 gates, Stripe test mode). The preview run is yours: push `build/autonomous`,
  open the preview, and work through §8 against it with test keys before you do it
  against live ones.
- **Load tests and Lighthouse.** Both measure a deployed environment; run on
  `next dev` they produce numbers worse than production that prove nothing about it.
  Run them on the preview.
- **The 39 markers.** §0.1. `npm run release:gate` is green except for that last
  step, and the step exists so that "we'll fix the footer later" cannot be the
  thing nobody said out loud.
