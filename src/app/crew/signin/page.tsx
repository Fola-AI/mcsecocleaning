import type { Metadata } from "next";

import { CrewSignInForm } from "@/components/crew/CrewSignInForm";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

/**
 * Crew sign-in (§9.2).
 *
 * Two fields and a big button. The PIN field is `inputMode="numeric"` so a phone
 * shows a number pad, and `autoComplete="off"` because this is often a shared
 * device and the browser offering the last person's details is the exact thing
 * that must not happen.
 */
export default function CrewSignInPage() {
  return (
    <div className="pt-8">
      <h1 className="text-2xl font-bold">Crew sign-in</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Your email or mobile number, and your PIN. If you have forgotten it, ring the office — they can set a new one.
      </p>
      <CrewSignInForm />
      <p className="mt-8 text-center text-xs text-ink-soft">
        {site.name} · if this is a shared phone, sign out when you finish your day.
      </p>
    </div>
  );
}
