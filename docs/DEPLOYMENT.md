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

## 5. Email deliverability (do before sending anything real)
Configure **SPF, DKIM and DMARC** for the sending domain in Resend and warm the
domain. Booking confirmations landing in spam is a business-ending failure (§9.2).

## 6. Inngest (durable scheduler)
1. Create an Inngest app; set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
2. Register the serve URL: `https://<domain>/api/inngest`.
3. Verify the `scheduler-heartbeat` cron runs and logs (Phase 1 acceptance). Fire
   a `test/heartbeat` event to check the pipeline on demand.

## 🚨 Launch gate — remove the global noindex (do NOT skip)
The whole site currently ships **noindex** (meta robots + `robots.txt` Disallow: /)
because `NEXT_PUBLIC_ALLOW_INDEXING` is unset — correct for the test deploy, and
**business-ending if it ships to the real domain unchanged.** A cleaning business
that search engines cannot see has no acquisition funnel.

At public launch, on the production domain only:
- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING="true"`
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real domain (fixes canonicals + sitemap host)
- [ ] Redeploy, then confirm `robots.txt` allows `/` and the homepage meta reads
      `index, follow` (curl both). Only after the NAP placeholders in
      `src/config/site.ts` are real.

## 7. Post-deploy SEO
- Submit `sitemap.xml` in Google Search Console; verify the property.
- Confirm `robots.txt`, `llms.txt`, canonical tags and JSON-LD render.
- Run PageSpeed Insights on mobile; confirm **LCP < 2.5s, INP < 200ms, CLS < 0.1**.
- Ensure `/book`, `/account/*`, `/admin/*`, `/crew/*` are noindex.

## 8. Monitoring
Add Sentry (`@sentry/nextjs`) and an uptime monitor. Wire `NEXT_PUBLIC_SENTRY_DSN`.
(Tracked as a launch-hardening task, §Phase 6.)
