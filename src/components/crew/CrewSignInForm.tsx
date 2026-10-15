"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { crewSignIn } from "@/app/actions/crew";

/**
 * The sign-in form (§9.2).
 *
 * Designed for a thumb: large targets, a numeric keypad for the PIN, and no
 * autofill — on a shared device the browser offering the previous crew member's
 * email is precisely the failure this app must not have.
 *
 * The fields are **uncontrolled**, read from the form on submit. §9.2's context
 * is "a phone, often on mobile data": hydration can take a visible moment on a
 * slow connection, and anything typed into a controlled input before React takes
 * over is thrown away when it does. Someone who starts typing the second the
 * page paints should not lose what they typed. (The E2E gate found this by
 * doing exactly that, faster than a person could.)
 */
export function CrewSignInForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [canSubmit, setCanSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const identifier = String(data.get("identifier") ?? "");
    const pin = String(data.get("pin") ?? "");

    start(async () => {
      const res = await crewSignIn({ identifier, pin });
      if (res.ok) {
        form.reset();
        router.push("/crew");
        router.refresh();
        return;
      }
      setError(res.message);
      // Clear the PIN on failure, not the identifier: retyping the number they
      // got right is friction for nobody's benefit.
      const pinField = form.elements.namedItem("pin");
      if (pinField instanceof HTMLInputElement) {
        pinField.value = "";
        pinField.focus();
      }
      setCanSubmit(false);
    });
  };

  /** Enable the button once both fields look plausible. Read from the form, so
   *  it works for text typed before hydration as well as after. */
  const refresh = (event: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    setCanSubmit(
      String(data.get("identifier") ?? "").trim().length >= 3 &&
        String(data.get("pin") ?? "").trim().length >= 4,
    );
  };

  return (
    <form onSubmit={submit} onInput={refresh} className="mt-6 space-y-4">
      <div>
        <label htmlFor="crew-identifier" className="block text-sm font-semibold">
          Email or mobile
        </label>
        <input
          id="crew-identifier"
          name="identifier"
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
          autoComplete="off"
          // A pattern rather than stripping characters as they type: rewriting
          // the field's value on every keystroke is what makes an uncontrolled
          // input controlled again.
          pattern="[0-9]*"
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 text-2xl tracking-[0.5em]"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full py-3 text-base"
        disabled={pending || !canSubmit}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
