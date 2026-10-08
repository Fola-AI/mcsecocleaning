# SETUP.md — Fola's checklist before ignition

This is yours, not Claude Code's. Work through it once. When every box in §8 is ticked, paste `CLAUDE_CODE_PROMPT.md` into Claude Code and leave it to run. Claude Code reads §1 (your decisions) but never edits this file.

You already have some of this from the Phase 1–2 build and the pre-Phase-3 runbook (Neon project, Vercel, Resend, Auth). Where a step says *Check*, it's confirming what exists rather than creating it.

> **Where this machine actually stands, checked 8 Oct 2026.** Two things gate the whole run:
>
> 1. **There is no `.env.local`.** The only env file in the repo is a stale `.env` carrying the `.env.example` placeholders — `DATABASE_URL` points at `localhost`, so the app runs with no database at all. Nothing in §3 has reached this machine. **Delete that `.env`** once you create `.env.local` (Next.js loads both, and a leftover placeholder will confuse the dev-database guard later). Until `.env.local` exists, the build completes L1 and then stops: every stage from L2 on needs the database.
> 2. **D1 in §1 is unanswered**, and a blank D1 is a hard stop by design.
>
> Everything else below is either already done or can wait. `.claude/settings.json` (§5) has been created for you.

---

## 1. Decisions — Claude Code reads these

Tick one option per line. D1 must be answered. Leave any other line blank and Claude Code treats it as an open question: it parks the dependent item and keeps building around it.

**D1 — How you review schema, pricing-logic, payment and auth changes** · *answered 8 Oct 2026*
- [x] **A. Batch review at merge checkpoints.** Claude Code builds, tests and commits them, lists each in *Review queue*, and you review before merging to `main` (5 checkpoints). The build keeps moving.
- [ ] B. Stop on every new migration and wait for your sign-off (how the Phase 1–2 build ran). Safer per change, but the build halts each time.

**D2 — Crew assignment mode** (follows from employee vs self-employed, PRD §14.6) · *answered 8 Oct 2026*
- [ ] `assign` — the system assigns jobs (employees)
- [ ] `offer` — crews are offered jobs they can decline (genuinely self-employed)
- [x] **Not decided — build both, choose before launch.** L4 builds and tests both modes; the production config value is chosen before launch.

**D3 — Owner rate-card editor (Task 5) cleared to build in L10**
- [ ] Yes
- [ ] No — skip it; rates stay code-only

**D4 — Media retention** (PRD allows 12–24 months)
- [ ] 12 months  - [ ] 18 months  - [ ] 24 months

**D5 — Rate limiting backend**
- [ ] Upstash Redis (free tier; add keys in §4)
- [ ] Postgres-backed (no extra account; slightly more DB load)

**D6 — Eco positioning weight** (copy emphasis only)
- [ ] Primary brand position from day one
- [ ] Phase-two differentiator

---

## 2. Security housekeeping (5 minutes)

- [ ] **Confirm the Neon `neondb_owner` password was reset** after it was pasted into chat on 30 Sep. Neon → Roles → `neondb_owner` → Reset password. If you're not sure, reset it again now; you'll re-copy the strings in §3 anyway.
- [ ] Never paste a connection string or key into any chat, Claude Code included. Claude Code reads `.env.local` itself.

---

## 3. Accounts and keys

### 3.1 Neon — Claude Code's own database
1. Neon → project `mcsecocleaning` → **Branches → New branch** `dev`, parent `production`, **auto-delete: Never**.
2. **Connect** → choose branch `dev`. Copy the **pooled** string (host contains `-pooler`) → `DATABASE_URL`, and the **direct** string (pooling off) → `DIRECT_URL`. Append `&connect_timeout=15` to both.
3. Copy the direct host (the `ep-…` part between `@` and `/`) → `DEV_DB_HOST`. This is what stops Claude Code touching any other database.
4. **Do not** put `production` or `gate` strings in `.env.local`.

If you finished the runbook gate on the `gate` branch, note it in `PROGRESS.md` under *Pre-Phase-3 gate*; if not, leave it — L2 reruns it on `dev` automatically.

### 3.2 Vercel — check
- [ ] Settings → Environment Variables: **Preview** scope uses the `dev` values from this file (DB, Stripe test, Resend, R2, Twilio). **Production** scope: leave as it is — LAUNCH.md handles it.
- [ ] Previews build from any branch (default). Claude Code pushes `build/autonomous`; you'll get a preview URL per push.
- [ ] Settings → Git → Production Branch is `main`.

### 3.3 Stripe — test mode only
1. Dashboard in **Test mode**. Developers → API keys → copy `sk_test_…` → `STRIPE_SECRET_KEY`, `pk_test_…` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. Settings → Payment methods (test) → enable **Bacs Direct Debit** (needed in L11).
3. Install the CLI on your Mac: `brew install stripe/stripe-cli/stripe`. No login needed — Claude Code runs it with the test key and sets `STRIPE_WEBHOOK_SECRET` from its output locally.
4. Leave live keys alone. They go in at launch via LAUNCH.md.

### 3.4 Resend — check
- [ ] `RESEND_API_KEY` exists. `EMAIL_FROM` can be `onboarding@resend.dev` for now; domain verification is a LAUNCH.md step.
- [ ] Set `DEV_EMAIL_REDIRECT` to your own inbox. Every email the app sends outside production goes here instead of to the customer address.

### 3.5 Auth — check
- [ ] `AUTH_SECRET` — run `npx auth secret` (or `openssl rand -base64 32`). A dev-only value.
- [ ] Owner email is `mcsecocleaning@gmail.com` (seeded). Sign-in links land in `DEV_EMAIL_REDIRECT` in dev.

### 3.6 Access-code encryption key
- [ ] `ACCESS_CODE_ENC_KEY` for dev: `openssl rand -base64 32`.
- The **production** key is generated separately at launch and stored in your password manager. Losing it means every stored alarm and lockbox code is unreadable. It never goes in `.env.local`.

### 3.7 Cloudflare R2 — media (needed for L7)
1. Cloudflare → R2 → enable (card required; usage at this scale is pennies).
2. Create bucket `mcseco-media-dev`, **location / jurisdiction: EU**.
3. R2 → Manage API tokens → create token, **Object Read & Write**, scoped to that bucket only. Copy Account ID, Access Key ID, Secret → `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; bucket name → `R2_BUCKET`.
4. Bucket → Settings → CORS: allow `PUT` and `GET` from `http://localhost:3000` and `https://*.vercel.app`.
5. `MEDIA_LINK_SECRET`: `openssl rand -base64 32`.

### 3.8 Twilio — SMS (needed for L9)
1. Create an account. A trial account is fine for the build: it only sends to numbers you verify, which is exactly what dev needs.
2. Verify your own mobile → `DEV_SMS_REDIRECT`.
3. Copy `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. `TWILIO_SENDER_ID` is already `mcseco` in `.env.example`; if your trial account can't send from an alphanumeric sender, put the trial phone number there for dev and register the alphanumeric sender at launch.

### 3.9 Sentry — monitoring (needed for L14)
- Create a Next.js project. Copy the DSN → `NEXT_PUBLIC_SENTRY_DSN` (the DSN is designed to be public). Optionally create an auth token for readable stack traces → `SENTRY_AUTH_TOKEN`.

### 3.10 Optional
- **Upstash** (if D5 = Upstash): create a Redis database in `eu-west-2` → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **Cal.com**: a public booking link for site surveys → `NEXT_PUBLIC_CALCOM_URL` (L11).
- **Google review link** once GBP is verified → `GOOGLE_REVIEW_URL` (L12). Without it, L12 leaves a `TODO(business-input)` marker.

### 3.11 Inngest
- Nothing to do now. Locally Claude Code runs the Inngest dev server, which needs no keys. `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` are a LAUNCH.md step.

---

## 4. `.env.local` template

Repo root, git-ignored. **This file does not exist yet — create it.** Names match the repo's `.env.example`; the new ones (`APP_ENV`, `DEV_*`, `MEDIA_LINK_SECRET`, `AUTH_SECRET`, `DEV_DB_HOST`, `NEXT_PUBLIC_ALLOW_INDEXING`) get added to `.env.example` in L1. `ADMIN_ACCESS_CODE` is retired — leave it out. Delete the stale `.env` once this exists.

```bash
# ── environment ───────────────────────────
APP_ENV="development"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_ALLOW_INDEXING="false"
VAT_REGISTERED="false"

# ── database: Neon "dev" branch ONLY ───────
DATABASE_URL="postgresql://...-pooler....eu-west-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15"
DIRECT_URL="postgresql://....eu-west-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15"
DEV_DB_HOST="ep-xxxx-xxxx.c-2.eu-west-2.aws.neon.tech"
# If Prisma errors with P1013, delete &channel_binding=require from both strings.

# ── auth ───────────────────────────────────
AUTH_SECRET=""

# ── analytics (optional in dev) ───────────
NEXT_PUBLIC_GA_ID=""

# ── email ──────────────────────────────────
RESEND_API_KEY=""
EMAIL_FROM="mcsecocleaning <onboarding@resend.dev>"
LEADS_INBOX=""
DEV_EMAIL_REDIRECT=""

# ── stripe: TEST keys only ────────────────
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET=""      # Claude Code fills from `stripe listen`

# ── access codes (dev key, never the prod key) ──
ACCESS_CODE_ENC_KEY=""

# ── inngest (local dev server, no keys) ───
INNGEST_DEV="1"
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""

# ── media: R2 (L7) ─────────────────────────
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET="mcseco-media-dev"
MEDIA_LINK_SECRET=""

# ── sms: Twilio (L9) ───────────────────────
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_SENDER_ID="mcseco"
DEV_SMS_REDIRECT="+44..."

# ── monitoring (L14) ───────────────────────
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""

# ── optional ───────────────────────────────
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
NEXT_PUBLIC_CALCOM_URL=""
GOOGLE_REVIEW_URL=""
```

Keys you don't have yet can stay blank. Claude Code parks the stage that needs them and carries on with the rest; you'll see it under *Keys present* in `PROGRESS.md`.

---

## 5. Let Claude Code run unattended

Without this it stops to ask permission for every command. **Already done** — `.claude/settings.json` was created next to the existing `.claude/launch.json` on 8 Oct 2026 with the contents below. Nothing to do; L1 validates it.

```json
{
  "permissions": {
    "allow": [
      "Read", "Edit", "Write",
      "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)",
      "Bash(psql:*)", "Bash(stripe listen:*)", "Bash(stripe trigger:*)",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git branch:*)",
      "Bash(git checkout:*)", "Bash(git switch:*)", "Bash(git stash:*)",
      "Bash(git push origin build/autonomous:*)",
      "Bash(ls:*)", "Bash(cat:*)", "Bash(grep:*)", "Bash(mkdir:*)", "Bash(mv:*)"
    ],
    "deny": [
      "Bash(git push origin main:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(vercel:*)",
      "Read(./.env.production*)"
    ]
  }
}
```

Claude Code validates this in L1 and logs anything it had to adjust. Alternative if you'd rather not maintain a list: run Claude Code with `--dangerously-skip-permissions`, but only inside a dev container with no production credentials on the machine. The allow-list is the safer default.

**Keep the Mac awake** for long runs: start Claude Code inside `caffeinate -i` (e.g. `caffeinate -i claude`), plugged in, lid open or with an external display.

---

## 6. Content only you can supply

Claude Code will not invent these. The repo already marks them: `PLACEHOLDER` values in `src/config/site.ts`, and `TODO(business-input)`, `TODO(pricing)`, `TODO(legal)` comments elsewhere. `npm run check:launch-inputs` (added in L1) lists whatever remains, and L15 won't pass until it's empty. Fill them in `src/config/site.ts` whenever you have them, or answer under *Open questions* in `PROGRESS.md`. `docs/PHASE-0-CHECKLIST.md` tracks the off-platform side.

- Trading name, company number, registered address, phone — and the exact NAP string as it will appear on Google Business Profile
- Insurance: insurer, public liability amount, whether Treatment/CCC and key cover are held
- DBS: whether crews are checked, and the public liability figure. The site currently shows "DBS-checked" and "£5m public liability" from placeholders; L1 hides both until you confirm
- Eco products actually used, with certifications — for the product transparency page
- Years trading (or leave the claim out)
- Real photographs: crew, before/afters, and at least one per launch district
- Area facts for each location page (streets, property stock, parking) — Claude Code can draft from what you give it, not from guesses
- Legal pages: T&Cs, privacy, cookies, cancellation — reviewed by you (and ideally an adviser)
- Google review URL once GBP is verified

---

## 7. What stays out of Claude Code's reach

- Neon `production` and `gate` connection strings
- Stripe live keys and the live webhook secret
- The production `ACCESS_CODE_ENC_KEY`
- Vercel production environment variables and production deploys (it never pushes to `main`)
- DNS, domain registrar, Google Business Profile, Search Console, ad accounts

All of that is yours, at launch, following `LAUNCH.md`.

---

## 8. Ignition checklist

The two that block everything are first. The rest can be filled in while the build runs.

- [ ] **§1 decisions ticked — D1 is required** (Claude Code stops if it's blank); the rest may stay blank
- [ ] **`dev` branch created; `.env.local` filled with at least the L2 keys; the stale `.env` deleted**
- [ ] §2 Neon password rotation confirmed
- [ ] Stripe CLI installed; `psql --version` works
- [x] `.claude/settings.json` in place — created 8 Oct 2026
- [x] The five documents are at the repo root — moved 8 Oct 2026; the new `CLAUDE.md` has replaced the old one, keeping the `@AGENTS.md` import. **Commit them** (they are currently uncommitted)
- [ ] Stay on `fix/pre-phase3-gate` (or `main` if you've merged it). The four Stripe fixes live there, and L1 branches from it. Note the branch is **unpushed** — it exists only on this Mac, so take a backup or push it before anything else
- [ ] Optional: if you still have the pre-Phase-3 runbook, save it as `docs/PRE-PHASE-3-GATE-RUNBOOK.md`. If not, `docs/DEPLOYMENT.md` §4b carries the same gates and L2 uses that instead
- [ ] Open Claude Code in the repo root and paste `CLAUDE_CODE_PROMPT.md`

## 9. While it runs and after

- Open `PROGRESS.md` (on the `build/autonomous` branch on GitHub) whenever you like. Three places matter: **⛔ STOPPED** at the top, *Open questions*, *Review queue*.
- Answer open questions by editing `SETUP.md` §1 or writing the answer under the question in `PROGRESS.md`, then commit. Claude Code picks it up next session.
- At each merge checkpoint: read the *Review queue* items and the *Checkpoint N merge notes*. Apply the listed migrations to the database Vercel Production points at, add any listed Production env vars, then merge `build/autonomous` into `main` via a pull request using the description provided. Merging deploys to production (still `noindex`), which is why the migrations go first.
- If a session ends, restart with the short resume prompt at the bottom of `CLAUDE_CODE_PROMPT.md`.
- After L15, follow `LAUNCH.md`.
