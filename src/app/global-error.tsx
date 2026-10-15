"use client";

import "./globals.css";
import { site } from "@/config/site";

/**
 * The page a customer sees when the root layout itself fails (§13.3, L14).
 *
 * `global-error` replaces the root layout when it is active, so it has to carry
 * its own `<html>` and `<body>`
 * (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`).
 * In Next 16 the retry prop is `retry`, not `reset`.
 *
 * Three things it deliberately does NOT do:
 *
 *  - **It does not show the error.** `digest` is shown because it is the handle
 *    that ties this page to the line `instrumentation.ts` wrote; the message is
 *    not, because a server error message can carry a row of the database with
 *    it.
 *  - **It does not report from here.** The server already reported it. A second
 *    report from the browser would double every count and tell us nothing new.
 *  - **It does not promise anything.** No "we've been notified", no apology for
 *    lost data — a customer mid-booking needs to know whether their booking
 *    happened, and the honest answer is the phone number.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-GB" className="h-full">
      <body className="min-h-full bg-paper">
        <main className="container-page max-w-lg py-20 text-center">
          <h1 className="text-2xl font-bold">Something went wrong at our end</h1>
          <p className="mt-3 text-ink-soft">
            This page could not be loaded. Nothing you were doing has been lost — if you were part way
            through a booking, nothing has been charged.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => retry()} className="btn btn-primary">
              Try again
            </button>
            <a href={`tel:${site.contact.phone}`} className="btn btn-outline">
              Call {site.contact.phoneDisplay}
            </a>
          </div>
          {error.digest ? (
            <p className="mt-8 text-xs text-ink-soft">
              If you call or email, quoting this reference helps us find it: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
