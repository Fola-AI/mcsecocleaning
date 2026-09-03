"use client";

import Script from "next/script";
import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * PECR-compliant cookie consent + GA4 (§5.1, §10.3).
 *
 * Rules enforced:
 *  - No non-essential cookies fire before genuine consent.
 *  - GA4 loads ONLY after the user explicitly accepts.
 *  - Privacy-preserving default: nothing tracks until accept; reject is one tap.
 *  - Choice persisted; banner does not reappear once decided.
 *
 * Consent is read via useSyncExternalStore so the value stays in sync with
 * localStorage (an external store) without setState-in-effect.
 */

const STORAGE_KEY = "mcs-cookie-consent";
const EVENT = "mcs-consent-change";
type Consent = "granted" | "denied" | "unset";

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Consent {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    return "unset";
  }
}

// Server + first hydration render: nothing decided yet.
const getServerSnapshot = (): Consent => "unset";

function setConsent(value: Exclude<Consent, "unset">) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage blocked — still updates in-memory via the event below */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ConsentAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <>
      {consent === "granted" && gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {consent === "unset" && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface shadow-2xl lg:bottom-4 lg:left-4 lg:right-auto lg:max-w-md lg:rounded-2xl lg:border"
        >
          <div className="container-page py-4 lg:px-5">
            <h2 className="text-base font-bold">We value your privacy</h2>
            <p className="mt-2 text-sm text-ink-soft">
              We use essential cookies to run this site. With your consent we also use analytics
              cookies (Google Analytics) to understand how the site is used. You can decline and
              still use everything. See our{" "}
              <Link href="/cookies" className="underline">
                cookie policy
              </Link>
              .
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button className="btn btn-primary sm:flex-1" onClick={() => setConsent("granted")}>
                Accept analytics
              </button>
              <button className="btn btn-outline sm:flex-1" onClick={() => setConsent("denied")}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
