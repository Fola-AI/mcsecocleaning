"use client";

import { useState, useTransition } from "react";
import { updateMyMarketingPrefs } from "@/app/actions/account";

/** One consent governs ALL channels (email + SMS) — see updateMyMarketingPrefs. */
export function MarketingToggle({ initial }: { initial: boolean }) {
  const [consent, setConsent] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (next: boolean) =>
    start(async () => {
      const res = await updateMyMarketingPrefs(next);
      if (res.ok) setConsent(next);
      setMsg(res.message);
    });

  return (
    <div className="mt-3">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consent}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>Email me occasional offers and cleaning tips. Unchecking this unsubscribes you from all marketing (email and SMS).</span>
      </label>
      <p className="mt-2 min-h-5 text-sm text-ink-soft" aria-live="polite">{msg}</p>
    </div>
  );
}
