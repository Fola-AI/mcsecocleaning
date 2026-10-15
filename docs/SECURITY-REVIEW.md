# Security and accessibility review — L14

**Date:** 15 October 2026 · **Branch:** `build/autonomous` · **Stage:** L14 (PRD §16.3, §13.3)
**Reviewer:** the build agent, reviewing its own work. Treat it as a map of what exists
and what is known to be missing, not as an independent audit — §13.3 asks for a
penetration test before launch, and this is not one.

Everything below was checked against the code at the time of writing. Where a
claim is enforced by a test, the test is named: a claim with no gate behind it is
true today and nothing stops it regressing, which is the distinction worth having.

---

## 1. Authorisation (RBAC)

**Model.** Auth.js (next-auth v5) with **database** sessions (`src/lib/auth.ts`),
roles `owner` / `admin` / `supervisor` / `crew` / `customer`. Three guards:
`requireRole([...])` for staff, `requireCustomer()` for the portal, `requireCrew()`
for the crew app.

**Pages.** Every page under `/admin`, `/account` and `/crew` calls a guard, except
the three sign-in pages, which cannot:

| Area | Guard |
| --- | --- |
| `/admin/*` (12 pages) | `requireRole(["owner","admin","supervisor"])` |
| `/admin/invoices`, `/admin/payroll` | `requireRole(["owner","admin"])` — money, so not supervisors |
| `/account`, `/account/property/[id]` | `requireCustomer()` + an ownership filter in the query |
| `/crew`, `/crew/jobs/[id]` | `requireCrew()` + `assignments: { some: { crewId } }` |
| `/admin/login`, `/account/signin`, `/crew/signin` | none, by necessity |

The crew scoping is in the `where` clause, not in the rendering: `/crew/jobs/[id]`
loads `where: { id, assignments: { some: { crewId } } }`, so another crew's job id
is a 404 rather than a hidden element.

**Server actions.** In the App Router *every export of a `"use server"` module is a
callable endpoint* — Next assigns it an id and a client may invoke it with any
argument. One such export had no authorisation decision in it
(`prepareOutstandingCheckoutForVerifiedJob`: the name claimed the caller had
verified ownership and nothing enforced it; it returned a Stripe Checkout URL plus
a customer's name and email for any job id). The core moved to
`src/lib/outstanding.ts` behind `import "server-only"`.

*Gate:* `src/app/actions/actions-authorise.test.ts` fails unless every export of
every `src/app/actions/*.ts` module either makes an authorisation call or appears
on an allow-list with a written reason. Eight exports are allow-listed: `getSlots`,
`createBooking`, `submitLead`, `crewSignIn`, `crewSignInForm`, `crewSignOut`,
`acceptProposal` — each one is reachable before a session exists. It is a lexical
scan: it proves a decision is *present*, not that it is correct.

**Known limits.**
- The scan covers `src/app/actions/*.ts`. The two inline magic-link actions live in
  the sign-in pages themselves and are outside it; both are public by design.
- `acceptProposal` treats the proposal id as the credential (a managing agent
  clicks a link; there is no account). Ids are cuids, the action accepts only a
  proposal already marked sent and only once. A guessed id is not a realistic
  attack, but it is capability-by-URL and worth stating plainly.

## 2. Webhooks

| Endpoint | Signature | Idempotency |
| --- | --- | --- |
| `POST /api/stripe/webhook` | `constructWebhookEvent` on the **raw** body; missing → 400, invalid → 400 | `WebhookEvent` row keyed on the Stripe event id, with a `status` so a failed handler is visible rather than lost |
| `POST /api/sms/inbound` | `X-Twilio-Signature`, HMAC-SHA1 over URL + sorted params (**added in this stage**) | Setting consent to `false` is idempotent by nature |
| `POST /api/inngest` | Verified by the Inngest SDK **when `INNGEST_SIGNING_KEY` is set** | Inngest's own event ids |

**Found and fixed in this stage.** `/api/sms/inbound` accepted any POST. The blast
radius was small — the only thing it can do is set `marketingConsent` to **false**,
so a forged request could opt someone *out*, never in — but it changed a customer
record for anyone who could guess a phone number. It now verifies the signature
whenever `TWILIO_AUTH_TOKEN` is set, returns 403 when it does not match, and
returns 403 for an unsigned request in production even with no token configured
(no token means no configured Twilio, so no legitimate caller).

The crypto is in `src/lib/twilio-signature.ts` and is tested against **Twilio's own
published example vector**, not one this code generated — a self-generated vector
only proves the code agrees with itself. `src/lib/twilio-signature.test.ts` also
covers a tampered parameter, an added parameter, a different URL, and the
empty-signature case (`timingSafeEqual("","")` is `true`, which is the shape of bug
that nearly let a blank crew PIN hash authenticate everyone in L5).

**Open for launch.** `INNGEST_SIGNING_KEY` is unset (SETUP §3.11 says it is a
`LAUNCH.md` step). Until it is set, `/api/inngest` in production would accept
unsigned requests, which is an endpoint that can *run functions*. It is listed in
`LAUNCH.md` as a release-gate item for that reason.

## 3. Access codes (§6.9)

- **At rest:** AES-256-GCM, versioned payload `v1:<iv>.<tag>.<ciphertext>`, key from
  `ACCESS_CODE_ENC_KEY` (32 bytes, base64). Encryption **throws** if the key is
  absent — there is no path that stores a code in plaintext.
- **Authenticated:** GCM, so tampering with a stored payload fails decryption
  rather than returning a wrong code.
- **Who:** only the crew assigned to the job.
- **When:** 2 hours before the slot to 4 hours after (`src/config/security.ts`).
- **Logged:** `AccessCodeAudit`, with an `outcome` of `revealed` **or `refused`** —
  added because a log of successes alone cannot answer "did anyone try to get at a
  code they had no business seeing?".
- **Never in a message:** the reveal path returns the code to one request and writes
  it nowhere — no email, SMS, log line or analytics payload — and the audit row
  records the property and the accessor, not the code. That is enforced by the leak
  scan `src/lib/access-codes.leak.test.ts`. `redactForReport` (§4) is a second net
  under it rather than the primary control: a pattern can always be out-run by a
  message shape nobody thought of, which is exactly what happened to its first
  version (see §10).

## 4. Secrets

*Gate:* `src/lib/secret-exposure.test.ts`, four checks:

1. No name on the sensitive list is read under a `NEXT_PUBLIC_` prefix.
2. The `NEXT_PUBLIC_` names in use are an **allow-list** of six that are safe to
   publish (site URL, Stripe *publishable* key, GA id, the indexing flag, the
   Sentry DSN, the Cal.com URL). A new one fails the gate until somebody decides.
3. Every module that reads a secret is server-side — `server-only`, `"use server"`,
   a route handler, or a known server module.
4. No client component imports a `server-only` module.

**What the scan proves, and what it does not.** It is lexical: check 3 looks for the
literal `process.env.<NAME>` for twelve named secrets, so a destructured or computed
read is invisible to it; check 4 matches `from "<module>"` one level deep, so a
dynamic `import()` or a transitive import is not seen. It catches "nobody thought
about this", which is the failure that keeps happening, and it is not a proof.

Two modules deliberately omit the `server-only` marker: `src/lib/materialise.ts`
and `src/lib/rate-limit.ts`. Neither reads a secret *directly* — both import
`@/lib/db`, which constructs the Prisma client from `DATABASE_URL`, so the honest
statement is that neither adds a new way for a secret to travel. Both are imported
only from server code, and both must be callable from the Playwright process — a limiter whose
counting can only be exercised by firing sixty real requests at a dev server is one
nobody has actually checked. The reason is written in each file.

Secrets live in `.env.local` (git-ignored); `.env.example` carries names and
comments only. The stale `.env` that predated this was deleted. No key value
appears in this document, in `PROGRESS.md`, or in any committed file.

## 5. Rate limiting (§13.3)

`src/lib/rate-limit.ts`, fixed window, counters in Postgres
(`RateLimitCounter`, migration `2026-10-15-rate-limit-counters.sql`). It **fails
open**: if the limiter itself errors, the request is allowed and the failure is
logged. A limiter that takes the booking form down when it breaks has done more
damage than the abuse it prevents.

| Surface | Rule | Where |
| --- | --- | --- |
| Quote / `getSlots` | 60 per minute | `src/app/actions/booking.ts` |
| Booking | 20 per minute | `src/app/actions/booking.ts` |
| Crew PIN sign-in | 20 per 5 minutes **per caller**, on top of the per-account lockout | `src/app/actions/crew.ts` |
| Lead forms | 20 per 5 minutes | `src/app/actions/leads.ts` |
| Magic-link sign-in, per caller | 20 per 5 minutes | both sign-in pages |
| Magic-link sign-in, per **mailbox** | **5 per 30 minutes** | both sign-in pages |

The mailbox bucket was added in this stage, and then tightened: limiting by IP alone
leaves a way to point many callers at one address and flood a stranger's inbox with
our name on the message, but at the caller rule's 20 per 5 minutes that inbox could
still take 5,760 of our emails a day — which is our deliverability reputation as
much as their nuisance. Nobody legitimately needs a sixth link within half an hour.
The address is lower-cased so case does not create a second bucket.

**The identifier** is the first entry of `x-vercel-forwarded-for`, falling back to
`x-forwarded-for` and then `x-real-ip`. The order matters: Vercel sets its own
header and a caller cannot prepend to it, whereas the first entry of a plain
`x-forwarded-for` is caller-supplied behind any proxy that *appends* rather than
overwrites. Vercel overwrites, so both are correct there — but a limiter keyed on a
value the caller chooses is not a limiter, and this app will not always be behind
exactly this edge.

**Two deliberate behaviours** worth knowing before reading the code: it **fails
open** (above), and the first request of a new window retries once on a unique-key
violation rather than falling into that catch — without the retry, the very first
request of every window would be the easiest one to get for free.

The limits are deliberately generous. A limit that catches a real customer is worse
than no limit, and `e2e/hardening.spec.ts` asserts the floors so a later "tighten
it up" cannot quietly drop them to something a household would hit.

**Crew PIN** (L5, separate mechanism — it protects one credential rather than the
service): scrypt (N=16384, 32-byte key, per-user salt), 5 failed attempts then a
lockout of 5 → 15 → 60 minutes, counted by attempt rather than by clock so attempts
spread over a day still add up. Length checks run **before** `timingSafeEqual`,
because that function throws on a length mismatch and returns `true` for
empty-versus-empty — a blank or corrupt hash would otherwise have authenticated
every PIN.

**Not done:** SETUP **D5** (Postgres or Upstash Redis) is unanswered. Postgres is
built because it needs no account and works today; call sites talk to
`checkRateLimit` rather than to a store, so answering "Upstash" later is an adapter
and some keys, not a change to every endpoint.

## 6. Sessions and cookies

- Auth.js database sessions: a revoked session is dead immediately, which a JWT is
  not. That is the right trade for an app where a crew member leaves.
- The crew session is a real Auth.js session row (30 days), cookie `httpOnly`,
  `sameSite: "lax"`, `secure` on a secure origin (the `__Secure-` prefix decides).
- Crew sign-out **deletes the row** and then clears the cookie, in that order. On a
  shared phone, clearing the cookie alone leaves a live session that the next
  person's browser could still present.

## 7. Headers and transport

`next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options: SAMEORIGIN`, HSTS (2 years, `includeSubDomains; preload`),
`Permissions-Policy` (camera and microphone off; geolocation `self` for the crew
app), and a written-out CSP. `poweredByHeader` is off.

**One accepted residual risk, stated plainly: `'unsafe-inline'` is in
`script-src`.** With it, this CSP is **not** XSS mitigation — an injected inline
script executes. What it still does is constrain which external origins can be
loaded, which is worth having and is not the same thing. Closing it means putting a
nonce on Next's own bootstrap scripts, a nonce must be generated per request, and
that makes every page dynamically rendered — giving up the static rendering the
marketing site's Core Web Vitals depend on. The trade is deliberate and it is
**Fola's to revisit**, not something this document should imply is already closed.
An earlier version of the comment in `next.config.ts` asserted that inline script
"is not allowed"; it was wrong, it has been corrected, and a gate now asserts that
`script-src 'self' 'unsafe-inline'` is present *and* that this document still
discusses it — so a later nonce implementation cannot leave a stale claim behind.

Three further entries look like holes and are not:

- `js.stripe.com`, `*.stripe.com` and **`m.stripe.network`** in `script-src` and
  `frame-src`, plus `r.stripe.com` in `connect-src`. Elements runs in Stripe's own
  iframes and the card form does not load without them. `m.stripe.network` is
  listed explicitly because `*.stripe.com` does **not** cover it — a different
  registrable domain. Both it and `r.stripe.com` were claimed by the config's
  comment and genuinely absent from the policy until a second review of this stage
  checked; the gate now asserts both, because the end-to-end CSP test loads `/`,
  `/prices` and `/book` and never mounts Elements, so it could not have caught it.
- `'unsafe-inline'` in `style-src`: Next inlines critical CSS, with the same
  nonce cost as above. Inline style is a far smaller risk than inline script.
- `'unsafe-eval'` **in development only**: React's dev build needs it, and the
  gate asserts the production value has none — from the config source, since these
  tests run against `next dev`.

**Staff areas:** `X-Robots-Tag: noindex, nofollow, noarchive` and a non-public
cache policy on `/admin`, `/crew`, `/account`, set in `next.config.ts` and
`src/proxy.ts`. Per-area `:path*` rules, not one alternation — the combined form
matched `/admin/jobs` but not `/admin`, which is the page an operator actually
opens.

**A nuance worth recording:** `/admin` carries `private, no-store` from the config,
while `/crew` and `/account` carry Next's own `no-cache, must-revalidate` for a
dynamically rendered route, which wins over a header set in the proxy. Both prevent
a stale page reaching the next person; `no-store` additionally keeps it off disk.
The gate therefore asserts the property that matters — never `public`, always
revalidated — rather than a literal string it cannot control.

*Gate:* `e2e/hardening.spec.ts` (9 checks), including one that loads `/`, `/prices`
and `/book` and fails on a CSP console violation. A CSP that blocks your own
scripts is a worse outage than the attack it prevents.

## 8. Accessibility — WCAG 2.2 AA

*Gate:* `e2e/accessibility.spec.ts`, 14 checks. Ten run `@axe-core/playwright`
over seven public routes, the booking wizard, the crew sign-in at 375 px and the
admin Today view, failing on any **serious or critical** violation; four exercise
the criteria axe cannot inspect (below). All 14 pass.

Three real defects were found and fixed:

1. **Contrast, on five pages.** The closing CTA band's heading rendered at
   **2.57:1** (deep green `#16241c` on brand green `#1f6d4c`), against a 3:1
   requirement for large text. Cause: the base layer in `globals.css` colours every
   `h1`–`h4` with `--color-ink`, and that element-level rule beats the `text-white`
   inherited from the band. Fixed by setting the colour on the heading itself
   (`src/components/marketing/CtaBanner.tsx`), with the reason in a comment so it is
   not "tidied up" later.
2. **Invalid list structure** on `/book`: a bare `<p>` ("Minimum visit length
   applied") sat between the `dt`/`dd` groups of the price summary's `<dl>`, which
   axe flags serious — a screen reader announces a list whose contents do not
   match. Moved outside the `<dl>`.
3. **The skip link was one pixel wide.** `sr-only focus:not-sr-only` is the neat
   way to write it and it did not work: `sr-only` pins the element to 1 × 1 with
   `clip`, and whether the `focus:` reversal wins depends on the order the rules
   land in the stylesheet — here it lost. The link received focus first, as it
   should, and a sighted keyboard user saw nothing. Rewritten
   (`src/components/layout/SkipLink.tsx`) so the element is always full size and
   only its position changes. Found by the keyboard test, which is precisely the
   class of defect axe cannot see: the markup was correct.

**Exercised rather than inspected.** These were written as tests rather than as a
checklist in this document, because a checklist is only true on the day it is
written:

- **2.4.1 Bypass blocks** — Tab from a cold page load reaches the skip link first,
  and the focused link has a real on-screen box.
- **2.1.1 Keyboard / 2.4.7 Focus visible / 2.1.2 No keyboard trap** — forty Tab
  presses through the booking wizard: its own controls are reachable, every focused
  control has an outline or a ring (not merely a changed border), and focus keeps
  moving rather than sticking.
- **2.5.8 Target size (minimum)** — every visible control on the crew sign-in at
  375 px measures at least 24 × 24 CSS pixels.
- **1.4.10 Reflow / 1.4.4 Resize text** — `/`, `/prices`, `/book` and `/guarantee`
  at 320 px and 375 px: horizontal overflow of at most 2 px (sub-pixel rounding),
  so nothing scrolls sideways.

**Read, not measured.** Every input has a programmatic label and errors are text
rather than colour alone (axe covers the first, the second is a reading of the
components); the rate-limit refusal on sign-in is `role="status"`; images go
through `next/image` with explicit sizes and decorative emoji carry `aria-hidden`;
the booking wizard carries address and contact details forward between steps
rather than asking twice (3.3.7 Redundant entry); the only sticky elements are the
price summary, which sits beside the form rather than over it, and the crew bottom
bar, which is `pb-24` clear of content (2.4.11 Focus not obscured).

**Not done:** no screen-reader pass with a real assistive technology (VoiceOver /
NVDA / TalkBack), and no testing with a user of one. Automated scanning plus a
keyboard pass finds a good share of defects and not all of them.

## 10. What a second reading of this stage found

The diff was reviewed again from a cold start, with no memory of writing it, before
it was committed — `CLAUDE.md` requires that for anything touching auth, payments,
access codes or migrations. It found no bypass in the signature verification or the
limiter's arithmetic, and it found eight things worth fixing. They are listed here
because the pattern in them is the useful part:

**Three were claims this document or a comment made that the code did not support.**
`next.config.ts` said inline script "is not allowed" while `'unsafe-inline'` sat in
`script-src` two lines above (§7 now states the posture and a gate holds both
honest). Both files claimed `m.stripe.network` was allow-listed when `*.stripe.com`
does not cover it — so the claim was wrong *and* a frame Stripe wants was blocked.
And `PROGRESS.md` described the new migration as having a composite unique key on
`(key, windowStart)`, which is not the table that was written.

**Three were coverage gaps in code that looked finished.** `redactForReport` missed
`accessCode: "483912"` — the quoted form, which is exactly how Prisma prints a
failing argument — because its separator allowed only `:` or `=`. It had no pattern
for a session cookie, which under database sessions *is* the session. It had none
for an opaque secret such as `ACCESS_CODE_ENC_KEY=…`, which can only be matched by
the name beside it. All three now have patterns and tests.

**One was a gate that did not gate.** The rate-limit tests proved the limiter
counts; nothing proved anything *called* it, so deleting the limiter from
`createBooking` would have left every test green. There is now a wiring check.

**One was a bug in the limiter's effect on a customer.** A rate-limited `getSlots`
returned `{}`, which the wizard renders as "no slots available in the next few
weeks — please call us". Customers behind one office or carrier NAT share an
address, so the limit could have told a real customer the business was fully booked
for a fortnight, and nobody would ever have heard about it. `getSlots` now returns a
distinct `too_many_requests` and the wizard says to wait a moment.

Also fixed: seventeen `console.error(…, error)` sites that bypassed the redaction
entirely (one of them logged a customer's email address verbatim), and an unbounded
table — the limiter wrote a row per caller per minute and nothing ever deleted one.
Both now have the thing that was missing: a scan, and an hourly sweep.

## 9. What this review does not cover

| Item | Why, and whose step it is |
| --- | --- |
| Penetration test | §13.3 asks for one before launch. Not something the build can do to itself. **Fola / a third party.** |
| Load test | Measures a deployed environment under load. Run against `next dev` on one laptop it produces numbers worse than production that prove nothing about it. **Vercel preview.** |
| Lighthouse / Core Web Vitals | Same reason — dev builds are unoptimised and unrepresentative. **Vercel preview.** |
| Error monitoring | Sentry is wired for a DSN (`NEXT_PUBLIC_SENTRY_DSN`) but there is no project and no DSN, so nothing is reported anywhere. **Parked: needs an account.** |
| `INNGEST_SIGNING_KEY` | Unset. See §2. **`LAUNCH.md` release gate.** |
| Rate-limit backend (D5) | Postgres built; Upstash is an adapter away. **Fola's decision.** |
| Screen-reader pass | See §8. **Needs a person and an assistive technology.** |
| `script-src 'unsafe-inline'` | Accepted, documented in §7: closing it means per-request nonces and giving up static rendering. **Fola's trade to revisit.** |
