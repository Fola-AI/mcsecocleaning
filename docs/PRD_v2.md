# Product Requirements Document — mcsecocleaning

**Version:** 2.0
**Date:** September 2026
**Supersedes:** v1.0 (September 2026)
**Prepared for:** Claude Code (build agent)
**Market:** United Kingdom only
**Currency:** GBP

---

## How To Use This Document

This is a build specification. Sections 1–12 define *what* to build. Section 13 defines *the order to build it in* and the acceptance criteria for each phase.

**Rules for the build agent:**

1. **Build phases sequentially.** Each phase must meet its acceptance criteria before the next begins. Later phases depend structurally on earlier ones — particularly the scheduling engine (Phase 2) and the job queue (Phase 1).
2. **Do not skip Phase 0.** It contains decisions and external processes with multi-week lead times that will block launch if deferred.
3. **Where this document says MUST, it is a hard requirement** — usually legal or architectural. Where it says SHOULD, use judgement and flag deviations.
4. **UK English throughout**, in code and in copy. See §5.5 for required terminology.
5. **Ship Phase 1 to production immediately.** The SEO clock starts on the day the site is indexed and takes 3–6 months to mature. Do not hold the marketing site back waiting for the application.

---

## 1. Executive Summary

A full-stack web application for a UK eco-friendly cleaning company that operates its own crews (not a marketplace). The system is simultaneously:

- **A marketing website** engineered to rank in local search and the Google map pack
- **A booking and payments platform** for one-off and recurring cleaning work
- **An operations system** for scheduling, crew management, quality control and payroll
- **A customer portal** for bookings, media, and issue resolution

**Business model:** the company employs or contracts its own cleaning crews and fulfils all work directly. Revenue comes from one-off jobs (primarily End of Tenancy and deep cleans) and recurring contracts (domestic weekly/fortnightly, commercial office, and communal area cleaning for residential blocks).

**Positioning:** eco-friendly cleaning with transparent published pricing, photographic proof of work, and a stated re-clean guarantee. Most UK cleaning companies still require a phone call for a quote and provide no evidence of work completed. That is the gap this product exploits.

**Primary commercial insight driving the build order:** End of Tenancy cleaning is high-ticket (£150–£350 typical, £220–£500+ in London), urgent, high-intent, and seasonal. It generates cash and reviews quickly, and it produces letting-agent relationships that open the door to recurring commercial work. Domestic recurring builds the stable base underneath it.

---

## 2. Goals & Non-Goals

### Goals

1. Rank in the Google map pack and local organic results for target service × area terms within 6 months.
2. Allow customers to get an instant, accurate, fixed price online and book without phoning.
3. Convert one-off customers into recurring contracts.
4. Run daily operations — scheduling, crew dispatch, quality control, payroll — from one system.
5. Provide photographic evidence of every completed job, both as a trust feature and as dispute protection.
6. Resolve complaints fast through a guaranteed re-clean, and capture the outcome.
7. Comply with UK VAT, consumer, and data protection law from day one rather than retrofitting.

### Non-Goals (v2 scope)

- Marketplace of independent third-party contractors
- Native mobile apps (responsive web only; crew interface must work well on a phone browser)
- Multi-currency or non-UK operation
- Public-sector tendering workflow (Contracts Finder / Find a Tender) — requires accreditations out of reach in year one
- Full route optimisation (travel-time buffering only in v2)
- Self-hosted LLM

---

## 3. User Roles & Permissions

| Role | Description |
|---|---|
| **Customer** | Books jobs, manages properties and subscriptions, uploads media, views completed-job photos, raises issues, leaves reviews |
| **Crew** | Views assigned jobs, sees property access instructions, clocks in/out, completes checklists, uploads before/after media, updates job status |
| **Supervisor** | Crew permissions, plus: views all jobs for their team, reassigns within team, reviews checklists |
| **Admin/Ops** | Full operational access: jobs, scheduling, crews, clients, payments, media, complaints, payroll, reports |
| **Owner** | Admin permissions, plus: pricing configuration, VAT settings, staff pay rates, financial reports, AI copilot |

**Requirements:**
- Role-based access control MUST be enforced server-side on every route and every data query. Hiding UI elements is not access control.
- Crew MUST NOT see customer payment details, other crews' pay rates, or jobs not assigned to them.
- Property access codes (alarm, lockbox) are restricted — see §6.9.

---

## 4. Service Verticals & Pricing

### 4.1 Service verticals

| Vertical | Model | Notes |
|---|---|---|
| **Domestic cleaning** | Recurring (weekly / fortnightly / monthly) or one-off | Core recurring revenue base |
| **End of tenancy cleaning** | One-off, fixed price | Highest ticket, highest intent. Includes 72-hour re-clean guarantee. |
| **Deep cleaning** | One-off, fixed price | Often the entry point that converts to recurring domestic |
| **After builders cleaning** | One-off, quoted | Higher rate; requires specialist equipment |
| **Office / commercial cleaning** | Recurring contract | Quoted via RFQ, not self-serve checkout |
| **Communal area cleaning** | Recurring contract | Blocks of flats via managing agents / RTM companies. Billing entity differs from site contact. |

### 4.2 Pricing model

The quote engine MUST output **both a price and an estimated duration**. Duration feeds the capacity system (§6.3) — they are the same calculation.

**Room-based pricing (domestic, EOT, deep clean).** Do NOT price on bedroom count alone or square footage. A two-bed with one bathroom and a two-bed with three bathrooms are different jobs. Inputs:

| Input | Notes |
|---|---|
| Kitchens | Highest per-room cost and time |
| Bathrooms / WCs | Second highest |
| Reception rooms | Living/dining |
| Bedrooms | |
| Hallways, studies, conservatories | Lower-cost increments |
| Property condition | Standard / heavily soiled multiplier |
| Service level | Regular / deep / end of tenancy multiplier |

Plus:
- **Minimum job value** (configurable; market norm around £120 for EOT)
- **First-clean surcharge** for new recurring customers — a first visit takes 1.5–2× a maintenance visit. Not pricing this loses money on every new client. MUST be configurable and applied automatically to the first job of a new subscription.
- **Frequency discount** — lower per-visit rate for weekly/fortnightly commitment. This is the primary mechanism for converting one-off customers to recurring and MUST be visible in the quote.
- **Regional multiplier** — configurable, for future expansion beyond the launch area.

**Add-ons:** interior windows, oven/appliance interiors (priced per appliance), carpet cleaning (per area), upholstery, fridge/freezer interior, balcony. Each carries its own price and duration.

**Commercial (office, communal):** priced per square foot or per visit-hour, quoted manually via the RFQ flow (§6.6). No self-serve checkout.

**Hourly mode:** the engine SHOULD support an hourly pricing mode (rate × minimum hours) as an alternative to fixed pricing for regular domestic work, since a meaningful share of the UK market prices this way. Configurable per service type.

### 4.3 Published pricing

The site MUST publish "from" prices for all self-serve services. This is a deliberate differentiator — most UK competitors require a phone call — and it directly captures "how much does X cost" search intent. Prices displayed to consumers MUST be VAT-inclusive (§10.1).

---

## 5. SEO & Content Strategy

SEO is a primary product requirement, not a marketing afterthought. It shapes the URL structure, the rendering strategy, and the content model.

### 5.1 Rendering & technical baseline

- **Next.js with SSR/SSG** for all public pages. Marketing and service pages MUST be server-rendered and fully crawlable.
- **Core Web Vitals targets:** LCP < 2.5s, INP < 200ms, CLS < 0.1 (mobile). These are the thresholds — not a generic "3 second load time".
- All images via `next/image`, AVIF/WebP, explicit dimensions, lazy-loaded below the fold. Before/after galleries will destroy LCP if unmanaged.
- Clean semantic URLs, XML sitemap (auto-generated), robots.txt, canonical tags.
- **`noindex` all authenticated routes**, the booking wizard steps, and the customer dashboard.
- SSL, GA4 (behind cookie consent — see §10.3), Google Search Console.
- `llms.txt` at root — AI assistants are a growing local discovery channel.

### 5.2 Structured data

| Schema | Where |
|---|---|
| `LocalBusiness` (+ `CleaningService` where applicable) | Site-wide, with NAP matching Google Business Profile exactly |
| `Service` | Each service page |
| `FAQPage` | Each service and location page |
| `BreadcrumbList` | All pages |
| `Organization` | Site-wide |

⚠️ **Be conservative with `AggregateRating`.** Google restricts self-serving review markup — marking up reviews you collected yourself about your own business can trigger a manual action. Display reviews for users; do not mark them up as `AggregateRating` on `LocalBusiness`.

### 5.3 Location pages — content gate is mandatory

**The risk:** service × area pages generated from a template are the exact pattern Google names as *doorway abuse*, adjacent to *scaled content abuse* — a primary enforcement target of the March 2026 core update. Templated near-duplicate location pages have seen heavy demotions. The line is crossed when a location page is only a keyword container.

**The rule — enforce this in the CMS as a publishing gate, not as guidance:**

A location page MUST NOT publish unless it has:
- ≥ 400 words of genuinely area-specific content
- ≥ 1 photograph taken in that area
- ≥ 1 customer review from that area
- Area-specific pricing or service notes

**Launch with 4–6 areas you actually serve.** Add pages only as real coverage expands.

**Target boroughs, towns and postcode districts — not cities.** Nobody searches "cleaner London" with intent to book. They search "cleaner Clapham", "end of tenancy cleaning Islington", "domestic cleaner M20". UK local search operates at neighbourhood and postcode level.

Genuinely local content: property stock (period conversions vs new builds), HMO/student-let density, parking and permit conditions, named streets and landmarks, area-specific pricing.

### 5.4 URL structure

```
/                                       Home
/domestic-cleaning                      Service hub
/domestic-cleaning/[area]               Location page (content-gated)
/end-of-tenancy-cleaning
/end-of-tenancy-cleaning/[area]
/deep-cleaning
/after-builders-cleaning
/office-cleaning
/office-cleaning/[area]
/communal-area-cleaning
/eco-cleaning                           Positioning pillar
/prices                                 Published price list
/areas-we-cover                         Hub linking all location pages
/about  /contact  /reviews  /guarantee
/blog/[slug]                            Content hub
/book                                   Booking wizard (noindex)
/account/*                              Customer dashboard (noindex)
/admin/*  /crew/*                       Internal (noindex)
```

### 5.5 UK terminology — required

American terminology will fail to rank. Use these throughout code, copy, and URLs:

| Do not use | Use |
|---|---|
| Residential cleaning | **Domestic cleaning** |
| Move-out cleaning | **End of tenancy cleaning** |
| Public space cleaning | **Communal area cleaning** |
| Maid service | Cleaner / cleaning service |
| Post-construction | **After builders cleaning** |
| Sq ft (domestic) | Rooms / bedrooms / bathrooms |
| ZIP code | Postcode |

### 5.6 Eco positioning

The brand is *mcs**eco**cleaning*. This is a differentiator and a distinct, lower-competition keyword cluster, and it MUST be built into the product rather than treated as a tagline.

- **Keyword pillar:** eco friendly cleaning [area], green cleaning service, non-toxic cleaning, chemical-free cleaning, pet safe cleaning products, allergy-friendly cleaning
- **Product transparency page** — the actual products used, their certifications, what is not used and why
- **Booking wizard option** for fragrance-free / allergy-sensitive / pet-safe product sets, stored as a property preference and surfaced to crew
- **Commercial relevance:** UK commercial cleaning tenders increasingly carry ESG and environmental requirements. Documented green practice wins contracts competitors cannot bid for.
- **Supports a premium price point.** Eco-conscious buyers are less price-sensitive, which protects margin from the race to the bottom that kills most cleaning startups.

### 5.7 Content hub

Top-of-funnel content is required for domain authority and AI Overview visibility. Publishing MUST begin in Phase 1, not at the end of the build.

Launch set:
- How much does a cleaner cost in [area] — high volume, high commercial intent
- End of tenancy cleaning checklist (downloadable — also a lead magnet)
- Deep clean vs regular clean: what's the difference
- How often should an office be cleaned
- What's actually in conventional cleaning products (eco pillar)
- Pet-safe and allergy-friendly cleaning
- Getting your deposit back: what inventory clerks check

**Content accuracy requirement:** since the Tenant Fees Act 2019, landlords in England cannot require tenants to pay for professional cleaning as a blanket tenancy condition. Tenants must still return the property in its original condition, fair wear and tear excepted. **Do not publish copy claiming professional cleaning is legally required** — it is inaccurate under the CPRs and a poor E-E-A-T signal. Frame around deposit protection.

### 5.8 Google Business Profile — parallel workstream

GBP is the primary lead source for a local cleaning business. Map pack ranking is driven principally by proximity to the searcher, profile completeness and activity, review volume/quality/recency, and NAP consistency. This work starts in Phase 0, before any code, because verification has lead time and reviews accumulate slowly.

- Verification started immediately
- Primary category: House Cleaning Service. Secondaries: Commercial Cleaning Service, Office Cleaning Service, Carpet Cleaning Service, Window Cleaning Service
- Complete service list with descriptions and pricing
- Service area matching actual coverage
- **New photos weekly**; **GBP posts weekly**
- Q&A seeded and maintained
- Every review answered within 24 hours
- Booking link → booking wizard
- NAP identical to site footer, character for character

---

## 6. Core Features

### 6.1 Booking wizard

Multi-step, mobile-first, with progress indication and the running price visible at every step.

**Step 0 — Service area check.** Postcode entry, validated against the service area before anything else. Out-of-area visitors get a waitlist capture, not a dead end. This prevents wasted form completion and unfulfillable bookings.

**Step 1 — Service selection.** Domestic / End of tenancy / Deep clean / After builders. Commercial routes to the RFQ flow (§6.6).

**Step 2 — Property.** Room counts (§4.2), condition, property type. Saved properties pre-fill for returning customers.

**Step 3 — Frequency.** One-off / weekly / fortnightly / monthly, with the frequency discount shown as an explicit saving. This is the primary conversion-to-recurring moment; design it as such.

**Step 4 — Add-ons.** Each showing price and added duration.

**Step 5 — Date & time.** Slots generated from real capacity (§6.3). Never offer a slot that cannot be staffed.

**Step 6 — Access & preferences.** Entry method, parking, pets, product preferences, special instructions. Writes to the Property record (§6.9).

**Step 7 — Details & payment.** Contact details, account creation (or magic-link guest checkout), payment, and the CCR consent checkbox (§10.2).

**Requirements:**
- Progress MUST persist — abandoned bookings recoverable via email
- Quote MUST be stored with a version reference so the price honoured is the price quoted
- Full flow completable on a phone in under 2 minutes

### 6.2 Scheduling engine — **critical architecture**

> **This is the single most important design decision in the document. v1.0 generated recurring jobs from Stripe billing webhooks. That approach is broken and MUST NOT be implemented.**

**Why the v1.0 design fails:** billing cycles are not cleaning visits. A weekly client billed monthly is 4–5 visits per invoice, not one. Jobs must exist on the calendar weeks ahead so crews can be assigned and capacity planned — creating them when an invoice clears means the job appears the morning it is due. A failed card payment would silently delete a scheduled clean. And a recurring client asking to move one visit has no job record to move.

**Required design — schedule and billing are fully decoupled:**

```
Subscription
  ├── recurrence_rule (RRULE, e.g. FREQ=WEEKLY;BYDAY=TU)
  ├── stripe_subscription_id      ← billing only
  └── generates ↓

Job records, materialised 8–12 weeks forward by a rolling scheduled task
  ├── scheduled_date              ← individually editable
  ├── payment_status              ← independent of the job's existence
  └── subscription_id (nullable)
```

**Rules:**
- A scheduled task runs daily, materialising Job records from each active subscription's recurrence rule up to a rolling 8–12 week horizon.
- Stripe billing runs on its own cadence and only sets `payment_status` on the relevant jobs. It never creates or deletes them.
- Individual visits can be skipped, moved, or cancelled without touching the subscription.
- A failed payment raises an admin flag and a customer notification. It does not remove the job from the schedule.
- Use a proven RRULE library (`rrule.js`). Do NOT hand-roll recurrence logic — bank holidays, month-ends and BST/GMT transitions will break it.
- Blackout dates (bank holidays, company closure) MUST shift or flag affected jobs rather than silently generating them.

### 6.3 Capacity & availability

You cannot offer a time slot you cannot staff. Slot generation requires:

- **Estimated job duration** from the quote engine
- **Crew roster** — who works, which days, which hours
- **Crew time off** and unavailability
- **Existing bookings** for the date
- **Travel time** between consecutive jobs (§6.4)
- **Buffer** between jobs (configurable)

A `SlotAvailability` service computes bookable slots and is queried by the booking wizard. Admin MUST be able to override capacity manually (to squeeze in urgent work) and to set a simple daily cap as a fallback in early operation when the roster is small.

### 6.4 Service area & travel

- **Service area** defined by postcode districts or a radius from base. Validated at booking step 0.
- **Travel time** between consecutive jobs feeds the capacity calculation. Naive distance-based buffering is acceptable in v2; full route optimisation is out of scope.
- **Parking notes** captured per property (§6.9).
- If operating in London: ULEZ and Congestion Charge are real per-job costs and SHOULD be configurable inputs to commercial pricing.

### 6.5 Payments

**Model: authorise at booking, capture on completion.** Use Stripe `PaymentIntent` with `capture_method: manual`, or a `SetupIntent` to save the card and charge off-session at completion. Do NOT use default Stripe Checkout immediate capture — the final price changes (extra rooms found on site, add-ons requested, cancellation or lockout fees), and capture-on-completion also makes CCR compliance cleaner.

| Client type | Method |
|---|---|
| Domestic one-off | Card — authorise at booking, capture on completion |
| Domestic recurring | Card on file, charged off-session per visit |
| Commercial recurring | **Bacs Direct Debit** or invoice / net-30 |
| Commercial ad-hoc | Invoice, bank transfer |

**Bacs Direct Debit** is required for commercial recurring. UK card fees apply to every collection; Bacs is roughly 1% capped at £2 and has no card-expiry failures. On a £400/month communal cleaning contract this is a meaningful saving and much less failed-payment admin. Available via Stripe (single vendor) or GoCardless (UK-native, stronger DD tooling). Note the mandate setup period and multi-day collection cycle affect cash flow.

**Also required:**
- **Cancellation fee** — enforced, tiered by notice period. A stated policy with nothing enforcing it is not a policy. Must be fair under the Consumer Rights Act 2015 and disclosed before payment.
- **Lockout / no-access fee** — crew arrives, cannot get in. Common and currently unbilled in most small operations.
- **Tipping** — prompt in the post-job email. Meaningful revenue for crews and a retention lever for staff.
- **Refunds** with reason codes, linked to the job.
- **Webhook idempotency** — Stripe *will* deliver duplicates. Store `event.id` and reject replays. Unhandled, this double-charges customers and double-creates jobs.

### 6.6 Commercial RFQ flow

Office and communal area clients MUST NOT go through the self-serve wizard. It will not convert — these contracts involve site visits, custom scope, insurance requirements and negotiation.

```
"Request a commercial quote" form
  → Lead record created
  → Admin arranges site survey
  → Admin builds proposal (scope, frequency, price, term)
  → Sent to client, viewable and acceptable online
  → Acceptance → Subscription + recurring Job generation
```

Capture in the form: site type, approximate square footage, frequency required, floor types, access hours, number of WCs, waste requirements, insurance/accreditation requirements, decision timeline.

**Communal area specifics:** the **billing entity (managing agent) differs from the site contact and from the residents**. The data model MUST support a billing organisation separate from the site and its contacts.

### 6.7 Job status pipeline

| Status | Meaning | Trigger |
|---|---|---|
| `draft` | Quote created, not confirmed | Wizard in progress |
| `booked` | Confirmed by customer | Booking submitted |
| `payment_authorised` | Card authorised / DD mandate active | Stripe webhook |
| `scheduled` | Crew assigned | Admin or auto-assign |
| `in_progress` | Crew on site | Crew clock-in |
| `completed` | Work finished | Crew marks complete |
| `awaiting_feedback` | Remedy window open | Auto on completion |
| `closed` | Window elapsed or issue resolved | Auto or manual |
| `cancelled` | Cancelled | Manual; fee and refund logic |
| `on_hold` | Paused (access, weather, customer request) | Manual |
| `no_access` | Crew attended, could not enter | Crew action; triggers lockout fee |

Every status change MUST be logged with actor, timestamp and optional note. The pipeline drives all downstream automation.

### 6.8 Crew operations (mobile web)

- **Today's jobs** — list and map, ordered by schedule
- **Job detail** — property, access instructions, parking, pets, product preferences, customer notes, checklist
- **Clock in / clock out** with timestamp and GPS stamp. Drives payroll, proves attendance in disputes, and gives actual-vs-estimated duration — your only real measure of job profitability.
- **Checklist completion** — tick items, attach photos to items
- **Before/after photo capture** — direct upload to storage (§6.10)
- **Status updates** — one tap
- **Report an issue** — damage, access problem, additional work needed

Design for a phone, often on mobile data, sometimes on a shared device. Consider PIN login on a persistent session rather than repeated password entry.

### 6.9 Properties, access & site notes

The `Property` record is operationally critical and was largely absent from v1.0.

| Field | Notes |
|---|---|
| Address, postcode, property type | |
| Room counts | Feeds pricing |
| **Entry method** | Key held / lockbox / client present / concierge / key safe |
| **Lockbox or key safe code** | 🔒 Encrypted at rest |
| **Alarm code and instructions** | 🔒 Encrypted at rest |
| **Parking instructions** | Permits, restrictions, nearest options |
| **Pets** | Name, type, temperament, containment |
| Do-not-touch areas | |
| Product preferences / allergies | Links to eco options (§5.6) |
| Access notes | Free text |
| Preferred crew | Significant retention factor in domestic work |

**Security requirement:** access codes MUST be encrypted at rest and visible only to the assigned crew, and only within a configurable window around the scheduled job (e.g. 2 hours before to 2 hours after). Access to codes MUST be logged. Treat these with the same seriousness as payment data — a leaked alarm code is a burglary.

### 6.10 Media exchange

**Customer → business (pre-job).** Upload widget visible only while the job is active (`booked` through `in_progress`), hidden once completed. Backend issues a short-lived (5–15 min) presigned PUT URL scoped to the job ID; browser uploads direct to object storage; backend records the file reference.

**Business → customer (completed work).** Crew uploads before/after photos. Customer receives a stable link containing a JWT with the job ID and a 48-hour expiry. On click, the backend validates expiry server-side, generates a fresh short-lived presigned GET URL and redirects. After expiry the customer sees an "expired — contact us" message.

> **Correction from v1.0: the link expires, the media does not.** v1.0 specified auto-deleting media a few hours after link expiry. Before/after photos are your primary evidence in damage disputes and card chargebacks, and chargeback windows run 60–120+ days. Deleting evidence at 48 hours to save storage on R2 — where egress is free and storage costs pennies — is a bad trade.
>
> **Required: media retained 12–24 months, admin-accessible throughout. Only the customer-facing link expires.**

### 6.11 Issue resolution & re-clean guarantee

> **Correction from v1.0: the window is a guaranteed-remedy window, not a support cut-off.** v1.0 made the thread read-only after 48 hours. You cannot refuse to hear a customer after 48 hours, and UK consumer protection will not respect that window.

```
Job → completed
  → Remedy window opens automatically
      · 72 hours for end of tenancy (UK market standard)
      · 48 hours for domestic and commercial
  → Customer notified by email + SMS with a link to the thread
  → Customer reports issue (text + optional photos)
  → Admin triages; sentiment/urgency flagged in the dashboard
  → Resolution paths:
       · Re-clean — zero-price Job created, linked to original, scheduled within 24–48h
       · Partial refund
       · Explanation / no action
  → Window elapses → thread converts to a general support ticket
    (customer always retains a route to contact you)
```

**A separate damage/breakage claim path** is required — different handling (insurance notification, evidence gathering, escalation) and different retention requirements from a general complaint.

**Market the guarantee explicitly** — "72-hour re-clean guarantee" on the EOT landing page is a conversion lever, not just a policy.

### 6.12 Quality control checklists

Per-service-type task templates that crews complete on site. This is how quality stays consistent across crews and how you defend against disputes.

- `ServiceTemplate` defines checklist items per service type
- `JobChecklistItem` records completion, by whom, when, with optional photo
- **EOT checklists MUST mirror what inventory clerks assess** — inside cupboards, appliance interiors, limescale, skirting boards, interior windows, extractor fans. This is your evidence in a deposit dispute.
- Admin can require photo evidence on specified items

### 6.13 Reviews & reputation

Review volume and recency directly drive map pack ranking *and* conversion rate. This is the highest-ROI system in the build.

- Automated request at 24 hours post-completion, **email and SMS**
- Follow-up nudge at day 4 if no review recorded
- **Deep link direct to the Google review form** — reduce to one tap
- Trustpilot as a secondary destination (strong UK trust signal)
- On-site display of reviews (see the `AggregateRating` caution in §5.2)
- Target: **5+ new Google reviews per month, sustained**
- Track review velocity as a core metric

⚠️ **Do NOT build a review gate** — asking for satisfaction first and only routing happy customers to Google violates Google's policy and risks the profile. Ask everyone.

### 6.14 Growth features

- **Discount codes** — percentage or fixed, per-service, expiry, usage caps, single-use or multi. Required for every ad campaign and partnership.
- **Referral programme** — give £X / get £X, unique code per customer, automatic credit application, promoted in every post-job email. Cleaning has exceptionally high referral rates.
- **Frequency discount** — see §4.2. The core recurring-conversion mechanism.
- **Account credit** — from referrals, goodwill gestures, partial refunds.
- **Gift vouchers** — SHOULD; sells well in December.
- **Waitlist** for fully-booked slots and out-of-area postcodes.

### 6.15 Admin-created bookings — **required from Phase 2**

In the first 12 months a large share of bookings will arrive by phone, WhatsApp or referral. Admin MUST be able to create a customer, property and job manually, take payment by payment link, or mark as invoice/cash. **This is not a later convenience — without it the business cannot operate on day one.**

Also required: CSV import for any existing client list.

### 6.16 Payroll

You have crews and currently no way to pay them.

- Pay rate per crew member (hourly, per-job, or percentage)
- Hours from clock-in/clock-out records
- Holiday accrual tracking
- Period report: hours worked, jobs completed, pay owed
- Export in a format your accountant or payroll software can consume

### 6.17 Notifications

| Trigger | Channel | Recipient |
|---|---|---|
| Booking confirmed | Email + SMS | Customer |
| Pre-contract information | Email (durable medium — legal requirement, §10.2) | Customer |
| Reminder, 24h before | Email + SMS | Customer |
| Crew on the way | SMS | Customer |
| Job completed + media link | Email + SMS | Customer |
| Review request, 24h after | Email + SMS | Customer |
| Payment failed | Email | Customer + Admin |
| Subscription lapsing | Email | Customer |
| New assignment | Push/SMS | Crew |
| Schedule change | SMS | Crew |
| Complaint raised | Email + dashboard | Admin |
| Job stuck in progress | Dashboard alert | Admin |

All customer marketing messages MUST honour PECR consent state and carry an unsubscribe (§10.3).

---

## 7. AI Copilot — Deferred To Post-Launch

**Rationale for deferral.** v1.0 allocated roughly 40% of the build plan to AI features that require data volume a new business will not have for a year. Churn scoring and dynamic pricing on a small dataset produce statistical noise presented with false confidence — worse than no analytics, because you will act on it. Until you have volume, a weekly SQL summary email delivers 80% of the value for 2% of the work.

### 7.1 Provider — the Kimi K2 problem

v1.0 specified Kimi K2 (Moonshot AI, China) via OpenRouter. Under UK GDPR, transferring personal data to China requires an International Data Transfer Agreement or the UK Addendum to SCCs, plus a documented Transfer Risk Assessment. There is no UK adequacy decision for China, and routing via OpenRouter adds a second sub-processor and obscures where inference occurs.

**Required: use a UK/EU-hosted model** with a signed DPA and zero-retention configuration — Azure OpenAI (UK South), AWS Bedrock (eu-west-2), or equivalent. Cost difference at your volume is negligible; compliance difference is total.

**Regardless of provider, apply data minimisation:** send pseudonymised, aggregated data only — job IDs, dates, service types, numeric metrics. Never names, addresses, phone numbers, access codes, or raw complaint text with PII. Resolve identities client-side after the model responds.

### 7.2 Phase A capabilities (works immediately, no history needed)
1. **Admin natural-language query** over your own data, read-only. Useful from day one.
2. **Complaint sentiment and urgency triage** on incoming messages — no historical data required.
3. **AI-drafted rebooking prompts** for lapsing recurring contracts, human-approved before sending.

### 7.3 Phase B capabilities (defer until ~500+ completed jobs)
4. Churn risk scoring with contributing factors
5. Pricing suggestions from demand and margin history
6. Crew performance insight (repeat bookings vs complaint rates)
7. Weekly AI-generated business summary

### 7.4 Guardrails
AI drafts; humans approve. High-stakes actions (pricing changes, complaint responses, anything sent to a customer) require explicit approval. Low-stakes actions (internal reminders) may graduate to auto-send after 4–8 weeks of validated accuracy. Log approve/edit/reject on every suggestion — this is both a trust metric and a training signal.

---

## 8. Design Requirements

- **Mobile-first.** The majority of local service searches and bookings happen on phones.
- **Quote widget above the fold** on the homepage — not a phone number.
- **Sticky mobile CTA bar** (call + book) on all public pages.
- **Real photography only.** Actual crews, actual before/afters, actual uniforms and vehicles. Stock imagery measurably reduces conversion for local services. This requires a photo shoot in Phase 0 — it has lead time.
- **Trust bar:** insurance (£5m public liability), years trading, aggregate rating, DBS-checked staff, eco credentials, re-clean guarantee.
- **Before/after galleries** per service vertical and per location page.
- **Distinct visual treatment per service vertical** so users and crawlers parse scope immediately.
- **Clean, high-contrast palette.** Given the eco positioning, greens and natural tones over the generic cleaning-industry blue. Final palette at design phase.
- **Accessibility: WCAG 2.2 AA.** The Equality Act 2010 applies to services, and accessibility quality overlaps heavily with SEO signals.
- Company name, number and registered address in the footer (Companies Act requirement).

---

## 9. Technical Architecture

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend/Backend** | Next.js (App Router), server-rendered | SSR for SEO; API routes for business logic |
| **Hosting** | **Vercel** (London region) | Built for Next.js; image optimisation, edge caching, preview deploys. Directly improves the Core Web Vitals that are a stated success metric. |
| **Database** | **PostgreSQL** (Supabase or Neon, eu-west-2) | JSONB, superior date/interval handling for heavy scheduling logic, managed backups, PITR |
| **ORM** | Prisma or Drizzle | |
| **Auth** | Auth.js / Clerk / Supabase Auth | **Do not roll your own.** Magic link for customers (better conversion, no password-reset support load); PIN-on-persistent-session for crew |
| **Queue / scheduler** | **Inngest or Trigger.dev** | Durable scheduled functions. Required — see below. |
| **Payments** | Stripe (PaymentIntents, Billing, Bacs) + optionally GoCardless | |
| **Object storage** | **Cloudflare R2** (EU jurisdiction) | S3-compatible, zero egress fees, no ops burden |
| **Email** | Resend / SendGrid / Postmark | |
| **SMS** | Twilio / MessageBird, alphanumeric sender ID | |
| **AI** | UK/EU-hosted model with DPA (§7.1) | |
| **Monitoring** | Sentry + uptime monitoring | |
| **Analytics** | GA4 (consent-gated) + Search Console | |

**Departures from v1.0:** Hostinger is a poor fit for an SSR app with webhooks, cron and background queues — shared plans handle Node badly and a VPS makes you a sysadmin. Self-hosting object storage (SeaweedFS/RustFS) is pure operational risk with no upside for a cleaning company. MySQL vs Postgres was left unresolved in v1.0; resolve it as Postgres. Keep Hostinger for the domain if convenient.

### 9.1 Background jobs — required infrastructure

The system depends on timed work throughout. `setTimeout` does not survive a deploy and serverless functions do not hold timers. A durable queue/scheduler MUST be in place in Phase 1 because every later phase depends on it.

Scheduled tasks:
- Rolling subscription job materialisation (daily)
- Remedy window open/close
- Media link expiry
- Review request at 24h; nudge at day 4
- Job reminders at 24h
- Payment retry handling
- Weekly summary report
- Media retention cleanup (at 12–24 months, not 48 hours)

### 9.2 Operational requirements

- **Staging environment** mirroring production; secrets management; no credentials in the repo
- **Database backups** with a *tested* restore
- **Webhook idempotency** — store and check `event.id`
- **Rate limiting** on quote, booking and auth endpoints
- **Timezone policy** — store UTC, render Europe/London, be explicit everywhere. BST/GMT transitions are the single most common source of scheduling bugs.
- **Email deliverability** — SPF, DKIM and DMARC configured and warmed before launch. Booking confirmations landing in spam is a business-ending failure mode.
- **Testing** — Stripe test-mode end-to-end on the full booking flow, webhook replay tests, e2e on the media expiry path, e2e on the recurrence generator across a bank holiday and a BST/GMT boundary. For a payments application this is not optional.

---

## 10. UK Legal & Compliance

### 10.1 VAT — build it now, switched off

Cleaning services are **standard-rated at 20% VAT**. The registration threshold is **£90,000** rolling 12-month turnover — reachable with roughly 8–10 weekly recurring domestic clients plus EOT work. Retrofitting VAT into a live pricing engine, quote history, Stripe products and invoice templates is genuinely painful.

**Requirements:**
- `vat_registered` global config flag; ships `false`, flips without a migration
- Every Job and Payment stores `net`, `vat_rate`, `vat_amount`, `gross` — not a single `price` field
- **Consumer-facing prices displayed VAT-inclusive** (legally required B2C). Never show "£120 + VAT" to a domestic customer.
- **Commercial invoices show net + VAT + gross**, with your VAT number — B2B clients reclaim and need a compliant VAT invoice
- `vat_number` field on commercial client records
- Stripe Tax configured correctly from the start

**Strategic note:** VAT registration is roughly neutral for commercial clients (they reclaim) but a straight 20% price rise or margin hit on domestic clients (they cannot). This is a real argument for weighting the client mix toward commercial and short-let hosts as you approach the threshold. Ask an accountant about the Flat Rate Scheme — the maths depends on your input VAT; do not assume a rate.

### 10.2 Consumer Contracts Regulations 2013 — 14-day cancellation right

An online booking is a **distance contract**. The customer has a statutory **14-day right to cancel**, which without mitigation would let someone book a clean, receive it, and cancel for a full refund.

**The exemption:** if the service is performed within the 14 days, the customer must **expressly request** early commencement **and acknowledge** losing the cancellation right once the service is fully performed.

**MUST implement:**
1. A **mandatory, unticked** checkbox at the payment step: *"I request that the cleaning service begins before the end of the 14-day cancellation period, and I understand that I will lose my right to cancel once the service has been fully performed."*
2. **Store the consent** against the Job — timestamp, IP, and the **version of the wording shown**. Version the wording so you can prove what was displayed.
3. **Pre-contract information in a durable medium** (the confirmation email, not just a web page): full price inc. VAT, cancellation policy, complaints route, trading name, company number, registered address.
4. Cancellation terms **fair under the Consumer Rights Act 2015** — a late-cancellation fee is defensible if it reflects genuine loss and is disclosed before payment; a punitive flat fee buried in T&Cs is not enforceable.

### 10.3 Data protection

- **ICO registration required.** Tier 1 is **£52/year** (£47 by Direct Debit) for micro-organisations — up to 10 staff or £632,000 turnover. Takes 15 minutes online. Do it in Phase 0. Fee exemption is not exemption from UK GDPR.
- **Privacy notice, cookie policy, T&Cs, cancellation policy** as real pages.
- **PECR cookie consent** — genuine consent before non-essential cookies fire. GA4 behind consent mode.
- **PECR marketing consent** — B2C email/SMS marketing needs consent or the soft opt-in (existing customer, similar services, opt-out offered at collection *and* in every message). Working unsubscribe in every message including SMS (`STOP`). Log opt-out state per contact and honour it across channels.
- **Right to erasure** workflow.
- **Access code handling** per §6.9 — encrypted, time-scoped, access logged.
- **AI data minimisation** per §7.1.

### 10.4 Insurance (also gates the LSA application and commercial contracts)

| Cover | Notes |
|---|---|
| **Public Liability** | £1m minimum; **£5m commonly required** by commercial clients and managing agents |
| **Employers' Liability** | **Legally required** with employees. Minimum £5m. Daily penalties for operating without it. |
| **Treatment / Care, Custody & Control** | Damage to the client's property while working on it — standard PL often excludes this. Essential for cleaning. |
| **Key cover** | Held keys and lockbox liability |

### 10.5 Employment status — affects your pricing floor

HMRC scrutinises cleaning heavily. Crews working your schedule, in your uniform, with your products, unable to send a substitute, are **employees** regardless of contract wording. That brings National Minimum/Living Wage compliance, 5.6 weeks statutory holiday, pension auto-enrolment (3% employer contribution, triggered by the first eligible employee), and employer National Insurance.

**This is why cleaning startups fail:** owners price against self-employed sole traders charging £15/hour, then discover their fully-loaded cost per cleaner-hour is far higher. **Model your true cost per crew-hour before setting the price list in §4.2.**

### 10.6 Other
- DBS checks on staff — not legally required for cleaning, but a strong trust signal for lone working in client homes and relevant to LSA screening
- Accreditations for future commercial work: SafeContractor, CHAS, Constructionline, BICSc, ISO 9001/14001

---

## 11. Data Model

```
Organisation            (for commercial/managing agent clients)
  id, name, vat_number, billing_address, payment_terms, type

User
  id, role, email, phone, name, password_hash|magic_link,
  organisation_id?, marketing_consent, consent_updated_at, created_at

Property
  id, customer_id, address_lines, postcode, property_type,
  room_counts (jsonb: kitchens, bathrooms, receptions, bedrooms, other),
  entry_method, access_code_encrypted, alarm_code_encrypted,
  parking_notes, pets (jsonb), product_preferences (jsonb),
  do_not_touch, access_notes, preferred_crew_id?, organisation_id?

ServiceType
  id, slug, name, pricing_model (room|hourly|quoted),
  base_rates (jsonb), duration_rates (jsonb),
  minimum_value, remedy_window_hours, active

AddOn
  id, service_type_ids[], name, price, duration_minutes, active

Quote
  id, customer_id?, property_snapshot (jsonb), service_type_id,
  frequency, addons[], pricing_version,
  net, vat_rate, vat_amount, gross, estimated_duration_minutes,
  expires_at, converted_job_id?

Subscription
  id, customer_id, property_id, service_type_id,
  recurrence_rule (RRULE string), preferred_time,
  stripe_subscription_id?, gocardless_mandate_id?,
  payment_method (card|bacs|invoice),
  price_per_visit_net, vat_amount, gross,
  status (active|paused|cancelled),
  first_clean_surcharge_applied, generated_until, created_at

Job
  id, customer_id, property_id, service_type_id, subscription_id?,
  quote_id?, status, scheduled_start, scheduled_end,
  estimated_duration_minutes, actual_duration_minutes?,
  net, vat_rate, vat_amount, gross,
  addons[], discount_code?, discount_amount,
  is_reclean_for_job_id?, ccr_consent (jsonb: given_at, ip, wording_version),
  source (web|admin|phone|partner), notes, created_at

JobAssignment
  id, job_id, crew_id, is_lead, assigned_at

JobStatusEvent
  id, job_id, from_status, to_status, actor_id, note, created_at

TimeEntry
  id, job_id, crew_id, clock_in_at, clock_in_lat, clock_in_lng,
  clock_out_at, clock_out_lat, clock_out_lng, duration_minutes

ServiceTemplate
  id, service_type_id, name, items (jsonb: label, requires_photo, order)

JobChecklistItem
  id, job_id, template_item_ref, label, completed, completed_by,
  completed_at, media_id?

Media
  id, job_id, uploader_role, storage_key, mime_type,
  category (pre_job|before|after|issue|checklist),
  checklist_item_id?, retain_until, created_at

MediaLink
  id, job_id, jwt_token_ref, expires_at, first_accessed_at, access_count

IssueThread
  id, job_id, type (complaint|damage_claim|general),
  status (open|resolved|converted_to_support),
  remedy_window_expires_at, sentiment?, urgency?,
  resolution (reclean|refund|explanation|none), resolution_job_id?,
  opened_at, resolved_at

IssueMessage
  id, thread_id, author_id, author_role, body, media[], created_at

Payment
  id, job_id?, subscription_id?, type (charge|refund|tip|fee),
  fee_reason (cancellation|lockout)?,
  stripe_payment_intent_id?, gocardless_payment_id?,
  net, vat_amount, gross, status, captured_at, created_at

Invoice
  id, organisation_id, job_ids[], invoice_number, issue_date,
  due_date, net, vat_amount, gross, status, pdf_storage_key

DiscountCode
  id, code, type (percent|fixed), value, service_type_ids[],
  max_uses, uses, valid_from, valid_until, single_use_per_customer

Referral
  id, referrer_customer_id, code, referred_customer_id?,
  referrer_credit, referred_credit, status, redeemed_at

AccountCredit
  id, customer_id, amount, reason, source_referral_id?,
  used_amount, expires_at?

Lead
  id, type (commercial|communal|waitlist), name, email, phone,
  organisation_name?, postcode, requirements (jsonb),
  status, assigned_to?, created_at

Proposal
  id, lead_id, scope (jsonb), price_per_visit, frequency,
  term_months, status, sent_at, accepted_at, subscription_id?

CrewProfile
  id, user_id, pay_type (hourly|per_job|percentage), pay_rate,
  working_hours (jsonb), dbs_checked_at?, start_date

CrewUnavailability
  id, crew_id, starts_at, ends_at, reason

ServiceArea
  id, postcode_district, area_name, slug, active, travel_notes

LocationPage
  id, service_type_id, service_area_id, slug,
  content, word_count, photo_ids[], review_ids[],
  published (bool — gated: word_count >= 400 AND photos AND reviews)

Review
  id, customer_id, job_id, rating, body, service_area_id?,
  platform (google|trustpilot|onsite), requested_at, submitted_at,
  display_on_site

BlackoutDate
  id, date, reason, applies_to (all|service_type)

AIInsight                (Phase 7+)
  id, type, related_entity_type, related_entity_id,
  score, reasoning, status (pending|approved|edited|rejected), created_at
```

---

## 12. Success Metrics

**Commercial**
- Revenue; **recurring revenue as % of total** (the number that determines whether this is a real business or a treadmill)
- Average job value; gross margin per job
- **CAC by channel** and LTV
- Customer retention / subscription churn

**Operational**
- **Crew utilisation %** (billable hours ÷ paid hours) — the core efficiency number
- Actual vs estimated job duration
- On-time arrival rate
- Re-clean rate (should trend down)
- Complaint resolution rate within the remedy window

**Acquisition**
- Booking conversion rate (visitor → completed booking)
- Quote-to-book rate
- **Review velocity** (new Google reviews per month; target 5+)
- Organic rankings for target service × area terms
- **GBP metrics**: profile views, calls, direction requests, booking clicks
- Core Web Vitals (mobile): LCP, INP, CLS

**AI (Phase 7+)**
- Approve / edit / reject rate on AI-drafted actions

---

## 13. Phased Build Plan

### Phase 0 — Pre-Build (no code)

External processes with lead times, plus decisions that block Phase 1.

- [ ] **ICO registration** (£52 — do this today)
- [ ] **Google Business Profile verification started** (weeks of lead time)
- [ ] **Google Local Services Ads application started** — cleaners qualify for Google Guaranteed in the UK; requires business registration, insurance and background checks
- [ ] Insurance quotes: PL £5m, EL, Treatment/CCC, key cover
- [ ] Alphanumeric SMS sender ID registered
- [ ] **Keyword research using UK terminology** — this determines the site structure, so it precedes it
- [ ] **Cost-per-crew-hour modelled** with an accountant → validates the price list (§4.2)
- [ ] Employment status decision (employee vs self-employed)
- [ ] AI provider decided (UK/EU hosted, §7.1)
- [ ] Stack decisions confirmed (§9)
- [ ] **Photography shoot** — real crews, uniforms, before/afters, vehicle
- [ ] Brand and palette

**Exit criteria:** GBP verification in progress, insurance quoted, keyword list produced, pricing validated against real costs, photography in hand.

---

### Phase 1 — Foundation & Marketing Site (ship to production)

**Infrastructure**
- Next.js scaffold, Vercel (London), CI/CD, staging environment, secrets management
- PostgreSQL + ORM; core schema (User, Property, ServiceType, ServiceArea, Lead)
- **Auth** (customers + admin)
- **Queue/scheduler installed and proven** (§9.1)
- Sentry, uptime monitoring, database backups with tested restore
- SPF/DKIM/DMARC configured and warmed

**Public site**
- Design system, mobile-first shell, WCAG 2.2 AA baseline
- Home, service hub pages (all six verticals), Prices, About, Contact, Guarantee, Areas We Cover
- **4–6 location pages meeting the content gate** (§5.3)
- **Eco positioning pillar** page (§5.6)
- **First 3 content-hub articles** (§5.7)
- Schema markup, sitemap, robots.txt, `llms.txt`
- **Lead capture form live** — the business can take phone bookings the day this ships
- GA4 behind consent mode, cookie banner, privacy notice, T&Cs, cancellation policy
- Company details in footer

**Acceptance criteria**
- Site live, indexed, submitted to Search Console
- Core Web Vitals passing on mobile (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- Cookie consent blocks GA4 until accepted
- A scheduled test job runs, survives a deploy, and logs correctly
- Lead form delivers to inbox and is not spam-filtered

---

### Phase 2 — Booking & Payments

- **Quote engine** — room-based inputs, add-ons, frequency discount, first-clean surcharge, minimum value; **outputs price AND duration**
- **VAT-aware pricing model** (flag off, structure in place, §10.1)
- **Capacity/availability service** (§6.3) with admin override and simple daily cap fallback
- **Service area postcode validation** at step 0
- **Booking wizard**, all steps (§6.1)
- **Stripe: authorise at booking, capture on completion**
- **CCR 14-day consent capture**, versioned and stored (§10.2)
- Pre-contract information email (durable medium)
- **Recurrence engine (RRULE), jobs materialised 8–12 weeks forward** (§6.2)
- Stripe Subscriptions / Bacs for billing — **fully decoupled from job generation**
- Discount codes
- **Admin-created bookings** + CSV client import (§6.15)
- Customer dashboard: bookings, reschedule, cancel, pause/skip, manage properties, saved payment methods

**Acceptance criteria**
- End-to-end booking on a phone in under 2 minutes
- Recurrence generator produces correct dates across a bank holiday and a BST/GMT transition
- Failed payment flags admin and notifies customer **without removing the job from the schedule**
- Duplicate Stripe webhook delivery does not double-charge or double-create
- CCR consent stored with wording version and retrievable
- No bookable slot can be offered that exceeds crew capacity

---

### Phase 3 — Operations & Crew

- Admin dashboard: calendar + list views, filters, **multi-crew assignment**, full status pipeline
- Crew mobile interface (§6.8): today's jobs, job detail, access instructions, **clock in/out with GPS**, checklists, photo capture, status updates, issue reporting
- **Property access & site notes**, encrypted codes with time-scoped access and audit log (§6.9)
- **Checklists / ServiceTemplates**, including the EOT inventory-aligned template (§6.12)
- Travel-time buffering into capacity
- "Crew on the way" notification
- Blackout dates
- **Payroll report and export** (§6.16)
- **Commercial RFQ → proposal → contract flow** (§6.6), including managing-agent billing structure
- **Bacs Direct Debit** for commercial recurring
- Invoicing / net-30 path

**Acceptance criteria**
- A crew member can complete a full job on a phone: arrive, clock in, view access code, complete checklist with photos, clock out
- Access codes are not retrievable outside the permitted window, and every access is logged
- Payroll export reconciles to time entries
- A commercial lead can be taken from enquiry to active recurring contract

---

### Phase 4 — Trust & Growth

- **Review engine**: automated request at 24h (email + SMS), day-4 nudge, Google deep link, Trustpilot secondary (§6.13)
- On-site review display, testimonials, trust bar
- Before/after galleries per vertical and per location page
- **Referral programme** + account credit (§6.14)
- **Tipping**
- Gift vouchers
- Location page expansion (content gate enforced)
- Waitlist

**Acceptance criteria**
- Review request fires reliably at 24h and the nudge suppresses correctly once a review is recorded
- Referral credit applies automatically at checkout
- No location page can publish without meeting the gate

---

### Phase 5 — Media & Resolution

- Cloudflare R2 setup (EU jurisdiction)
- Presigned upload flow, customer widget gated to active job statuses (§6.10)
- Crew before/after upload
- **Expiring customer link (48h), media retained 12–24 months** (§6.10)
- **Remedy window: 72h EOT / 48h other; re-clean workflow; damage claim path; converts to support ticket rather than locking** (§6.11)
- Admin triage view with urgency flags

**Acceptance criteria**
- Expired link fails validation server-side and shows the fallback message
- Underlying media remains admin-accessible after link expiry
- A complaint can be converted into a scheduled zero-price re-clean linked to the original job
- Thread remains reachable after the window closes

---

### Phase 6 — Launch Hardening

- Full Core Web Vitals audit and remediation
- Load testing: booking flow, media upload, slot generation
- Security review: presigned URL scoping, JWT edge cases, webhook signature verification and idempotency, RBAC audit, access-code encryption, rate limiting
- Accessibility audit (WCAG 2.2 AA)
- Email/SMS deliverability verification
- Backup restore test
- Local citation push (§14.3)
- Legal pages reviewed

### 🚀 **LAUNCH — begin taking revenue**

---

### Phase 7 — AI Copilot (post-launch, 6+ months of data)
Phase A capabilities only (§7.2): admin natural-language query, complaint sentiment triage, AI-drafted rebooking prompts with human approval.

### Phase 8 — Predictive Analytics (~500+ completed jobs)
Phase B capabilities (§7.3). Until then, a weekly SQL summary email delivers most of the value.

---

## 14. Marketing Plan

### 14.1 Weeks 1–4 (before the app exists)
- **GBP verified, fully completed, weekly photos and posts** — the highest-ROI action available
- **Get the first 10 reviews.** Below roughly 10 you are invisible in the map pack. Solve this cold-start problem deliberately.
- Citations live (§14.3)
- Photography, uniforms, vehicle branding
- Insurance and DBS documentation in hand — required for trust badges, LSAs and commercial tenders

### 14.2 Paid channels
- **Google Local Services Ads** — cleaners qualify for Google Guaranteed in the UK. Sits above both search ads and the map pack, charges per genuine lead rather than per click, and irrelevant leads can be disputed for credit. The badge is a strong trust signal for someone letting a stranger into their home. Start the application early.
- **Google Search Ads** — "end of tenancy cleaning [area]", "cleaner near me", "office cleaning [area]". Tightly geo-fenced, landing on the specific service page, not the homepage.
- **Meta/Instagram** — before/after video substantially outperforms static. Geo + household-income targeting, offer-led.
- **Local Facebook community groups** — genuinely one of the highest-ROI channels for a new UK cleaning business. Most towns have active recommendation groups where cleaner requests appear constantly. Organic participation, following group rules.
- **Checkatrade / Bark** — paid lead gen, mixed ROI, but fills early capacity.

*Note: Nextdoor is significantly weaker in the UK than the US — deprioritise.*

### 14.3 Citations & directories
**Priority:** Google Business Profile → Bing Places → Apple Business Connect → Facebook → **Trustpilot** → Yell
**Lead gen:** Checkatrade, Bark, TrustATrader, MyBuilder, Which? Trusted Traders
**Also:** FreeIndex, Cylex, Scoot, Thomson Local, local chamber of commerce

NAP must be identical everywhere, character for character.

### 14.4 Offers — structured to create recurring revenue
Do not discount one-off cleans; that buys unprofitable customers. Structure offers so the discount buys a contract:
- **First clean 30% off when booking fortnightly** — the discount purchases recurrence
- Free add-on (oven or interior windows) on first recurring booking
- **Referral: give £25, get £25**, auto-applied, promoted in every post-job email
- Seasonal: spring deep clean, pre-Christmas, end-of-tenancy campaigns

### 14.5 Partnerships — fastest route to volume
- **Letting agents and property managers** — EOT and move-in cleans. The highest-value relationship in UK cleaning.
- **Managing agents / RTM companies** — communal area contracts
- **Airbnb and serviced accommodation hosts** — high frequency (multiple cleans per property per week), less price-sensitive, sticky, and referrals spread fast in host communities. Strong in London, Edinburgh, Manchester, Bath, Brighton and coastal areas.
- **Student accommodation providers and universities** — enormous EOT volume June–September in university towns
- **Builders and renovation firms** — after builders cleans
- **Estate agents and property photographers** — pre-marketing cleans

Approach: direct outreach, a one-page partner rate sheet, LinkedIn for commercial.

### 14.6 Seasonality — staff and campaign against it

| Period | Pattern |
|---|---|
| **January** | Slowest. Run retention and prepay offers, not acquisition. |
| **March–May** | Spring cleaning peak. Convert one-off deep cleans to recurring. |
| **June–September** | **EOT peak** — tenancy cycles and student turnover. Enormous in university towns. Staff up. |
| **October–November** | Steady. Best window for commercial acquisition (budget planning season). |
| **December** | Pre-Christmas domestic peak, then a hard stop. Vouchers sell well. |

### 14.7 Retention
- **Consistent crew assignment** — clients strongly prefer the same cleaner and churn when it changes
- Proactive rebooking prompts for lapsing contracts
- Win-back campaign at 60 days since last clean
- Post-job before/after photos (a retention feature, not just a spec item)
- Loyalty: every 10th clean discounted

### 14.8 Competitive context
- **Housekeep** — entrenched in London, strong booking UX. Study their funnel.
- **Fantastic Services** — national, heavy content/SEO investment
- **Molly Maid, Time For You, Maid2Clean, Bright & Beautiful** — franchise and agency models
- **Bark / Checkatrade** — platforms you compete with and may buy from

**Your differentiation:** eco positioning, published pricing, photographic proof of work, instant online booking, and a stated re-clean guarantee. Most UK competitors still make you phone for a quote.

---

## 15. Out of Scope

- Independent contractor marketplace
- Native mobile apps
- Multi-region / multi-currency
- Full route optimisation
- Public-sector tendering workflow (revisit once SafeContractor/CHAS/ISO accreditations are held)
- Supplies and inventory management
- Self-hosted LLM

---

## 16. Open Decisions

These need answers, and several affect Phase 0 and Phase 2:

1. **Launch area** — determines pricing (London commands a 20–30% premium but is far more competitive), the location page set, and whether operations are van-based or transit-based.
2. **Employee or self-employed crews** — determines the cost floor, and therefore the price list, and therefore whether the quote engine is viable at the intended numbers.
3. **Number of crews at launch** — determines whether capacity management needs to be sophisticated or a simple daily cap suffices in v2.
4. **Current turnover relative to the £90k VAT threshold** — determines whether VAT is a day-one switch-on or a year-two flag.
5. **Van-based?** — affects EOT viability (needs carpet machines, steamers) and the travel-time model.
6. **Existing client list to migrate?** — CSV import priority.
7. **Paid acquisition budget for months 1–6** — SEO will not fill the schedule in months 1–3; something has to.

---

**End of PRD v2.0**
