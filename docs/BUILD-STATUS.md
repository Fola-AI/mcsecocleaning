# Build status

Tracks progress against the PRD's phased plan (§13). Updated as phases land.

## Phase 1 — Foundation & Marketing Site ✅ built

| Area | Status |
|---|---|
| Next.js 16 scaffold (App Router, TS, Tailwind v4), Vercel-ready | ✅ |
| Eco design system, mobile-first shell, WCAG 2.2 AA baseline (skip link, focus rings, touch targets, semantic landmarks) | ✅ |
| Home with **above-the-fold quote widget** + service-area check (§6.1 step 0) | ✅ |
| Six service hub pages (dynamic `[service]`, SSG) | ✅ |
| Prices, About, Contact, Guarantee, Areas We Cover, Reviews | ✅ |
| Eco positioning pillar page (§5.6) | ✅ |
| Content-gated location pages (`[service]/[area]`, §5.3) — 4 live example pages | ✅ |
| First 3 content-hub articles (§5.7, Tenant-Fees-Act accurate) | ✅ |
| JSON-LD: LocalBusiness/Organization/Service/FAQPage/BreadcrumbList (no AggregateRating) | ✅ |
| Sitemap, robots, `llms.txt`, canonical + OG metadata, OG image | ✅ |
| PostgreSQL + Prisma; **full §11 schema**; client singleton; seed | ✅ |
| **Durable scheduler (Inngest)** + heartbeat cron proving deploy-survival | ✅ |
| PECR cookie consent gating GA4; privacy/cookies/terms/cancellation pages | ✅ |
| Lead capture live → DB + email + waitlist + commercial RFQ intake | ✅ |
| VAT-aware money model (flag off, structure in) (§10.1) | ✅ |

### Phase 1 acceptance criteria
- [x] Site builds & prerenders (30 routes; service/area/blog as SSG)
- [x] Cookie consent blocks GA4 until accepted
- [x] Lead form works with graceful no-DB/no-email fallback
- [x] A scheduled task exists that survives deploy and logs (Inngest heartbeat)
- [ ] **Deploy to Vercel, verify Core Web Vitals on real mobile, submit to Search Console** — deploy step (see DEPLOYMENT.md)
- [ ] Email deliverability (SPF/DKIM/DMARC) — DNS step at deploy

## Phase 2 — Booking & Payments 🔄 in progress

| Item | Status |
|---|---|
| Quote engine — room-based, price **and** duration, VAT-aware, first-clean surcharge, frequency discount, minimum value, hourly mode | ✅ tested |
| Capacity/availability service — slots from roster/time-off/existing jobs/travel buffer; daily-cap fallback + admin override; never offers an unstaffable slot | ✅ tested |
| Service-area postcode validation at step 0 | ✅ |
| Booking wizard — all 8 steps, running price at every step, real slots | ✅ |
| CCR 14-day consent — versioned wording, stored with timestamp + IP | ✅ |
| Pre-contract information email (durable medium, §10.2) | ✅ |
| Recurrence engine (RRULE) + **daily subscription→Job materialisation**, decoupled from billing, blackout-aware, first-clean surcharge | ✅ (logic tested; DB write path guarded) |
| Discount codes — percent/fixed, service/frequency/expiry/usage rules; wired into booking | ✅ tested |
| Admin-created bookings (phone/WhatsApp/referral) — payment link / invoice / cash | ✅ |
| CSV client import — tolerant parser, header aliases, per-row errors | ✅ tested |
| Admin area gate — interim access code, deny-by-default, middleware + server guard (verified) | ✅ interim (Auth.js RBAC replaces) |
| Stripe authorise-at-booking (manual capture) + admin payment link | 🔄 server path built; needs keys + Stripe Elements UI + webhook handler |
| Customer dashboard (reschedule/cancel/pause/skip, saved methods) | ⏳ needs Auth.js + DB |
| Webhook idempotency handler (table exists) | ⏳ needs Stripe keys |

Tests: `npm test` — 39 passing (quote, recurrence across BST/GMT + bank holiday, capacity, VAT, discounts, CSV).

## Phase 3–8 ⏳ not started
Operations & crew, trust & growth, media & resolution, launch hardening, then
AI copilot / analytics. Schema models for all of these already exist.

### Carried into Phase 3 (from the pre-Phase-3 payments gate)
- [ ] **Recover / reissue an admin payment link.** The link is shown once, on the
  "Booking created" card, and nowhere after; a Checkout session expires after 24h
  with no reissue, so a missed or expired link is a booking we can't collect on.
  Add "Copy payment link" on the `/admin/jobs` row while the session is open
  (fetch the URL from Stripe via `Payment.stripeCheckoutSessionId`), and a reissue
  once it has expired.

---

## ⚠️ Business inputs required before launch (the §16 open decisions + registration)

These are **placeholders in code**, each marked `TODO(business-input)`. Nothing
is blocked from building, but these must be real before going live:

1. **Launch area(s)** — replace the Clapham/Islington *examples* in
   `src/config/areas.ts` with the real boroughs/postcode districts you serve, with
   real local photos and real reviews. (§16.1)
2. **NAP + company details** in `src/config/site.ts`: trading/registered name,
   Companies House number, registered address, phone, email, geo, ICO reference.
3. **Domain** — set `NEXT_PUBLIC_SITE_URL`.
4. **Pricing** in `src/config/services.ts` — the "from" prices are placeholders
   pending your cost-per-crew-hour model (§16.2, §10.5).
5. **VAT** — flip `VAT_REGISTERED=true` and set the VAT number once registered (§10.1).
6. **Insurance figures** (£5m PL etc.) in the trust bar — confirm with your insurer.
7. **Legal pages** — drafted; must be reviewed by a qualified adviser (§Phase 6).
8. **Real photography** (§8, Phase 0) — the site currently uses no stock imagery
   by design; add real crew/before-after photos when the shoot is done.

## Open decisions still needed (affect Phase 2)
Employee vs self-employed crews, number of crews at launch, current turnover vs
£90k VAT threshold, van-based?, existing client list to migrate?, paid-acquisition
budget months 1–6 (§16). These shape pricing and capacity logic in Phase 2.
