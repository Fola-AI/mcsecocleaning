"use client";

import { useActionState } from "react";

import { crewSignInForm } from "@/app/actions/crew";

/**
 * The sign-in form (§9.2).
 *
 * A **server-action form**, so it works before JavaScript has hydrated and even
 * if it never does. That is not a theoretical nicety here: §9.2's context is "a
 * phone, often on mobile data", which is exactly where hydration is slowest and
 * where a crew member tapping *Sign in* a second after the page paints would
 * otherwise have the page reload and discard everything they typed. (An E2E run
 * hit precisely that, faster than a person but not by much.)
 *
 * The rest is for a thumb: large targets, a numeric keypad for the PIN, and no
 * autofill — on a shared device the browser offering the previous crew member's
 * details is the exact failure this app must not have.
 */
export function CrewSignInForm() {
  const [state, formAction, pending] = useActionState(crewSignInForm, { message: null });

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="crew-identifier" className="block text-sm font-semibold">
          Email or mobile
        </label>
        <input
          id="crew-identifier"
          name="identifier"
          required
          minLength={3}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-base"
        />
      </div>

      <div>
        <label htmlFor="crew-pin" className="block text-sm font-semibold">
          PIN
        </label>
        <input
          id="crew-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          minLength={4}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-2xl tracking-[0.5em]"
        />
      </div>

      {state.message && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
