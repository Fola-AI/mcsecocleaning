"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-browser";
import { depositTerms, DEPOSIT_REFUND_NOTE } from "@/config/payments";
import { formatPence } from "@/lib/money";
import type { BookingPaymentIntent } from "@/app/actions/booking";

/**
 * Payment step (Option A): one card entry. For a large job the deposit is captured
 * and the balance is authorised on the SAME card under the hood, shown as a single
 * step with progress. The Payment Element is bound to the primary intent (deposit,
 * or full); the balance is confirmed by reusing the deposit's PaymentMethod. That
 * reuse works only because the deposit intent saves the card to the booking's
 * Stripe Customer (bookingIntentParams in lib/stripe).
 *
 * Degrades cleanly: no publishable key or no client secret → a "we'll be in touch"
 * fallback, never a broken Element (matches the server's stripeConfigured() path).
 */
export function PaymentStep({ paymentIntents, reference }: { paymentIntents: BookingPaymentIntent[]; reference: string }) {
  const stripePromise = getStripePromise();
  const deposit = paymentIntents.find((p) => p.kind === "deposit");
  const balance = paymentIntents.find((p) => p.kind === "balance");
  const full = paymentIntents.find((p) => p.kind === "full");
  const primary = full ?? deposit;
  const isSplit = Boolean(deposit && balance);

  if (!stripePromise || !primary?.clientSecret) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h2 className="text-2xl font-bold">Booking received</h2>
        <p className="mt-2 text-ink-soft">Reference <strong>{reference}</strong></p>
        <p className="mt-4 text-sm text-ink-soft">
          We couldn&apos;t start online payment just now — no card has been charged. We&apos;ll be in touch to take payment and confirm your slot.
        </p>
      </div>
    );
  }

  const grossPence = isSplit ? (deposit!.amountPence + balance!.amountPence) : (full?.amountPence ?? 0);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: primary.clientSecret, appearance: { theme: "stripe" } }}>
      <PaymentForm
        isSplit={isSplit}
        grossPence={grossPence}
        balanceClientSecret={balance?.clientSecret ?? null}
        reference={reference}
      />
    </Elements>
  );
}

type Phase = "idle" | "processing" | "authorising-balance" | "done" | "balance-incomplete" | "error";

function PaymentForm({
  isSplit,
  grossPence,
  balanceClientSecret,
  reference,
}: {
  isSplit: boolean;
  grossPence: number;
  balanceClientSecret: string | null;
  reference: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryPmId, setRetryPmId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const terms = isSplit ? depositTerms(grossPence, formatPence) : null;
  const busy = phase === "processing" || phase === "authorising-balance";

  // Authorise the balance on the card already used for the deposit.
  async function confirmBalance(paymentMethodId: string) {
    if (!stripe || !balanceClientSecret) return;
    setPhase("authorising-balance");
    setError(null);
    const res = await stripe.confirmCardPayment(balanceClientSecret, { payment_method: paymentMethodId });
    if (res.error) {
      setRetryPmId(paymentMethodId);
      setError(res.error.message ?? "We couldn't authorise the balance.");
      setPhase("balance-incomplete");
      return;
    }
    setPhase("done");
  }

  // Retry from the recovery screen — stays on that screen (via `retrying`) rather
  // than flipping phase, so a repeated failure keeps the retry affordance visible.
  async function retryBalance() {
    if (!stripe || !balanceClientSecret || !retryPmId) return;
    setRetrying(true);
    setError(null);
    const res = await stripe.confirmCardPayment(balanceClientSecret, { payment_method: retryPmId });
    setRetrying(false);
    if (res.error) {
      setError(res.error.message ?? "We couldn't authorise the balance.");
      return;
    }
    setPhase("done");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setPhase("processing");

    // Confirm the primary intent (deposit, or full) with the entered card.
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (error) {
      setError(error.message ?? "Payment could not be completed.");
      setPhase("error");
      return;
    }

    if (!isSplit) {
      setPhase("done");
      return;
    }

    // Split job: the deposit is now captured. Reuse its card for the balance.
    const pmId = typeof paymentIntent?.payment_method === "string" ? paymentIntent.payment_method : null;
    if (!pmId) {
      setError("Your deposit was received, but we couldn't reuse the card for the balance automatically.");
      setPhase("balance-incomplete");
      return;
    }
    await confirmBalance(pmId);
  }

  if (phase === "done") {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="text-4xl" aria-hidden>🎉</div>
        <h2 className="mt-3 text-2xl font-bold">Payment complete</h2>
        <p className="mt-1 text-ink-soft">Reference <strong>{reference}</strong></p>
        <p className="mt-4 text-sm text-ink-soft">
          {isSplit
            ? "Your deposit is paid and the balance is authorised — we'll charge it on completion. We've emailed your confirmation."
            : "Your card is authorised — we'll capture payment on completion. We've emailed your confirmation."}
        </p>
      </div>
    );
  }

  // Deposit captured but the balance wasn't authorised (failed, or the customer is
  // mid-recovery). The deposit is held and refundable; offer a retry, and set the
  // expectation clearly if they leave.
  if (phase === "balance-incomplete") {
    return (
      <div className="card mx-auto max-w-lg p-6">
        <h2 className="text-xl font-bold">Deposit received — balance not yet authorised</h2>
        <p className="mt-2 text-sm text-ink-soft">Reference <strong>{reference}</strong></p>
        {error && <p className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
        <p className="mt-3 text-sm text-ink-soft">
          Your deposit is paid and held. If you leave now your booking is kept and your deposit stays refundable within your
          14-day cancellation period — we&apos;ll email you to authorise the balance. Or try again now:
        </p>
        <button className="btn btn-primary mt-4" disabled={!retryPmId || retrying} onClick={retryBalance}>
          {retrying ? "Authorising…" : "Try authorising the balance again"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-lg p-6">
      <h2 className="text-xl font-bold">{isSplit ? "Pay your deposit & authorise the balance" : "Confirm your payment"}</h2>
      <p className="mt-1 text-sm text-ink-soft">Reference <strong>{reference}</strong></p>

      {terms && (
        <p className="mt-3 rounded-lg bg-brand-tint/50 px-3 py-2 text-sm text-brand-ink">
          {terms.sentence} {DEPOSIT_REFUND_NOTE}
        </p>
      )}

      <div className="mt-4">
        <PaymentElement />
      </div>

      {error && phase === "error" && (
        <p className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert">{error}</p>
      )}

      {phase === "authorising-balance" && (
        <p className="mt-3 text-sm text-brand-ink">Deposit paid ✓ — authorising the balance…</p>
      )}

      <button type="submit" className="btn btn-primary mt-4 w-full" disabled={!stripe || busy}>
        {phase === "processing"
          ? "Processing…"
          : phase === "authorising-balance"
            ? "Authorising balance…"
            : isSplit
              ? `Pay deposit ${formatPence(terms!.depositPence)}`
              : "Pay now"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-soft">Payments are processed securely by Stripe.</p>
    </form>
  );
}
