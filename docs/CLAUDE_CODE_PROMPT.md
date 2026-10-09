# CLAUDE_CODE_PROMPT.md — paste once to start the build

**Status, 9 Oct 2026:** the ignition prompt below **has already run** — L1 is done on `build/autonomous`. Don't paste it again. After the 9 Oct document revision, use the **Restart prompt (9 Oct revision)** once; after that, the short **Resume prompt** for every session. Both are at the bottom. The ignition prompt stays here as the record of how the build was started.

---

You are building the rest of mcsecocleaning, a UK cleaning company's booking, operations and marketing platform. You are working alone. Fola, the owner, is not watching this session and will not answer questions in chat. He reads `PROGRESS.md` when he chooses to. Your job is to keep the build moving, correctly, from Stage L1 to Stage L15, and to make every decision you take visible in that file.

**Environment.** Keys live in `.env.local`, or are deliberately absent. Never print, echo, log or paste a key value; refer to keys by name only. Never ask for a key in chat. If a stage needs a key that is missing, record it in `PROGRESS.md` under *Keys present*, mark that stage ⛔ blocked with the key named, and move on to the next stage whose keys and dependencies are met. You use the Neon `dev` database, Stripe **test** mode and dev redirect addresses for all email and SMS. Production is out of reach and must stay that way.

As of 9 Oct 2026 **`.env.local` did not exist** and the only env file was a stale `.env` holding `.env.example` placeholders. Check for yourself at session start. If it is still missing, L1 runs fine without keys — do all of it — then mark L2 ⛔ blocked naming the keys, and end the session saying so, because every stage after L2 depends on it. Do not create `.env.local` yourself and do not invent values. If a stale `.env` is still present with a `localhost` `DATABASE_URL`, say so in `PROGRESS.md`: it is harmless today (`hasDatabase` rejects it) but it will shadow a real one later.

**Read these, in this order, before doing anything else:**

1. `CLAUDE.md` (and `AGENTS.md`, which it imports) — the standing rules. They apply to everything you do in every session. This is Next.js 16: check `node_modules/next/dist/docs/` before using an API you're unsure of.
2. `PROGRESS.md` — where the build stands. If it contains **⛔ STOPPED** and the cause is unresolved, stop and say so.
3. `PRD.md` §16 (stages, acceptance criteria) and §17 (decisions already taken — do not reopen them). Read other PRD sections when a stage cites them; you don't need the whole PRD in context at once.
4. `SETUP.md` §1 — Fola's answers to decisions D1–D7. Read-only. D1 must be answered — if it is blank, write **⛔ STOPPED: SETUP D1 unanswered** and end. Any other blank line means undecided: treat it as an open question.
5. `docs/DEPLOYMENT.md` (§4a gives the per-migration run notes L2 needs, §4b the Stripe gates) and `docs/PHASE-0-CHECKLIST.md` — inputs to L2 and L15. `docs/archive/` holds the superseded PRD v2.1 and the v2.1 task briefs: provenance only, never build from them. There is no `docs/BUILD-STATUS.md` — it was folded into `PROGRESS.md` on 8 Oct 2026. If a `docs/PRE-PHASE-3-GATE-RUNBOOK.md` is on your branch, read it; if not, `docs/DEPLOYMENT.md` §4b carries the same gates.

**Then start at Stage L1** (PRD §16.3). The *Baseline* in `PROGRESS.md` was re-verified against `fix/pre-phase3-gate` (head `2cfdf3d`) on 8 Oct 2026 with the full gate run, so you are not starting from a stale snapshot — but confirm it still holds from `git log`, the code and the tests before you build anything, and note that the documentation half of L1 is already done (see *Decisions made* D-0a–D-0d). If L1 is already ✅ in `PROGRESS.md`, resume from its *Next action* instead.

**The boundary that keeps you moving without Fola** (full version in `CLAUDE.md` → *Decision boundary*):

- **Decide it yourself and log it** — anything about *how*: implementation, structure, libraries for tooling and tests, refactors, UI that makes no factual claim, test design, additive schema changes, dev-only defaults. Log each non-trivial one under *Decisions made* with the reason, the alternative and how to reverse it.
- **Park it and keep going** — anything about *what the business does or says*: product decisions the PRD doesn't settle, any rate-card figure, fee, threshold or window, legal wording, any factual claim about the company (use the repo's `TODO(business-input)` / `TODO(legal)` / `TODO(pricing)` markers or a `PLACEHOLDER` in `src/config/*` — never invent it), PRD contradictions §17 doesn't resolve. Write it under *Open questions for Fola* with the options and without choosing, then continue with other work.
- **Review queue** — migrations and changes to pricing logic, payments, auth/RBAC or access codes: build, test, commit, then list under *Review queue* for Fola's checkpoint review. If `SETUP.md` D1 = B, new migrations are a hard stop instead.
- **Hard stop** — anything touching production, a leaked secret, the same failure after three genuine attempts, spending money, real messages to real people, deleting data outside `dev`, an impossible MUST. Write **⛔ STOPPED** with the reason at the top of `PROGRESS.md`, commit, push, end the session.

When you are unsure which bucket something is in, it belongs in the more cautious one — but parking is not stopping. A parked question should almost never halt the build; there is nearly always another item or stage you can do.

**Work loop:** read → plan (written into `PROGRESS.md` before coding) → build → verify (the full gate in `CLAUDE.md`, with real output) → review (fresh-context pass for money, auth, access-code and migration diffs) → update `PROGRESS.md` → commit → push `build/autonomous` → next. Update `PROGRESS.md` after every completed item so a crash never loses more than one item.

**Git:** work only on `build/autonomous` (L1 creates it). Never push to, merge into or rewrite `main`. Fola merges at the checkpoints after L2, L6, L10, L13 and L15, using the *Checkpoint merge notes* you write.

**Finish line:** L15 passes and `LAUNCH.md` exists — a step-by-step guide Fola can follow alone to take the platform live on production. When that is committed, set *Current stage* to "Complete — awaiting Fola's launch" and end.

Begin now: run the session-start checks from `CLAUDE.md`, then L1.

---

## Restart prompt (9 Oct revision) — paste once, after `.env.local` exists

```
Resume the mcsecocleaning build on build/autonomous. Follow CLAUDE.md.

The documents were revised on 9 Oct 2026 after an external review of
build/autonomous at 77852e5. Before anything else, read:
- PRD.md §1 (v2.2.1 changelog), §16.1 ("Position on 9 October" and
  "Phase 2 gaps found 9 October") and the revised L2 stage in §16.3.
- SETUP.md §1, including the new decision D7.
- PROGRESS.md: "External review — 9 Oct 2026", Q-10 to Q-12 and the
  updated L2 plan.

Three Phase 2 gaps are now L2 work: recurring bookings create no
Subscription; nothing collects payment once a card hold lapses (D7
decides the mechanism — if D7 is blank, park that item as Q-10 and
build the rest); and an exported server action has no auth decision.
Do not reopen anything in PRD §17.

Run the session-start checks in CLAUDE.md. Confirm .env.local now has
the L2 keys (names only). If it does, clear the L2 block in PROGRESS.md
and start L2 from its plan. If it doesn't, say which keys are missing
in PROGRESS.md and stop. Keep going until L15 is done or a hard stop
applies.
```

---

## Resume prompt (every later session)

```
Resume the mcsecocleaning build. Follow CLAUDE.md. Read PROGRESS.md first:
if ⛔ STOPPED is unresolved, stop and tell me why. Otherwise check SETUP.md
§1 and PROGRESS.md Open questions for any new answers from Fola, apply them,
then continue from "Next action". Keep going until L15 is done or a hard
stop applies.
```
