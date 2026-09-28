import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { db, hasDatabase } from "@/lib/db";
import { constructWebhookEvent } from "@/lib/stripe";
import { recomputeJobPaymentStatus } from "@/lib/payments";

// Stripe SDK + raw-body signature verification need the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Stripe webhook (§6.5, §9.2). Signature-verified, idempotent, atomic.
 *
 * Idempotency + failure visibility (see WebhookEvent.status): the event id is the
 * PK. Only a 'processed' event rejects replay; 'received'/'failed'/absent retry.
 * The insert (gate) → work → mark-processed run in ONE transaction, so a crash
 * mid-way rolls back to absent and Stripe retries, rather than committing
 * 'received' and never stamping. A handler that THROWS is marked 'failed' in a
 * SEPARATE write (which survives the rollback), and we return 500 so Stripe
 * retries it.
 *
 * NON-NEGOTIABLE (§6.2): this NEVER creates or deletes Jobs. Schedule ≠ billing.
 * It only reconciles Payment rows (and mirrors Job.paymentStatus).
 */
export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event | null;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  if (!event) return new Response("stripe not configured", { status: 503 });
  // No DB → can't dedupe or record; ack so Stripe doesn't storm retries.
  if (!hasDatabase) return new Response("ok (no database)", { status: 200 });

  // Replay rejection: only a fully-processed event is a no-op. received/failed retry.
  const existing = await db.webhookEvent.findUnique({ where: { id: event.id } });
  if (existing?.status === "processed") return new Response("ok (already processed)", { status: 200 });

  const payload = event as unknown as Prisma.InputJsonValue;
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookEvent.upsert({
        where: { id: event!.id },
        create: { id: event!.id, provider: "stripe", type: event!.type, status: "received", payload },
        update: { status: "received" },
      });
      await handleStripeEvent(tx, event!);
      await tx.webhookEvent.update({
        where: { id: event!.id },
        data: { status: "processed", processedAt: new Date() },
      });
    });
  } catch (err) {
    console.error("[stripe webhook] handler failed", event.type, err);
    // The transaction (including the 'received' upsert) rolled back, so persist the
    // failure separately — otherwise the silent failure this column exists to catch
    // would leave no trace.
    await db.webhookEvent
      .upsert({
        where: { id: event.id },
        create: { id: event.id, provider: "stripe", type: event.type, status: "failed", processedAt: new Date(), payload },
        update: { status: "failed", processedAt: new Date() },
      })
      .catch(() => {});
    return new Response("handler error", { status: 500 }); // Stripe retries
  }

  return new Response("ok", { status: 200 });
}

/**
 * Reconcile Payment (and mirror Job.paymentStatus) from a Stripe event. NEVER
 * touches Job existence. Payment updates are updateMany so a not-yet-created row
 * (before /book wiring) is a safe no-op, not a throw.
 */
async function handleStripeEvent(tx: Prisma.TransactionClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated": {
      // Manual-capture authorisation confirmed. Safety net: if the inline
      // post-authorise DB update in /book was lost, reconcile the Payment here by
      // the id we put in metadata (the row was created BEFORE authorising, so it
      // always exists), stamping the intent id and 'authorised'.
      const pi = event.data.object as Stripe.PaymentIntent;
      const paymentId = pi.metadata?.paymentId || null;
      if (paymentId) {
        await tx.payment.updateMany({
          where: { id: paymentId },
          data: { status: "authorised", stripePaymentIntentId: pi.id },
        });
      } else {
        await tx.payment.updateMany({ where: { stripePaymentIntentId: pi.id }, data: { status: "authorised" } });
      }
      await recomputeJobForIntent(tx, pi.id);
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
      const paymentId = pi.metadata?.paymentId || null;
      // Match by our Payment id from metadata when present (deposit + re-charge
      // Checkout, where we set it), else by the intent id. Stamp the intent id so
      // recompute can resolve the job.
      if (paymentId) {
        await tx.payment.updateMany({
          where: { id: paymentId },
          data: { status: "captured", capturedAt: new Date(), stripeChargeId: chargeId, stripePaymentIntentId: pi.id },
        });
      } else {
        await tx.payment.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: "captured", capturedAt: new Date(), stripeChargeId: chargeId },
        });
      }
      await recomputeJobForIntent(tx, pi.id);
      break;
    }
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await tx.payment.updateMany({ where: { stripePaymentIntentId: pi.id }, data: { status: "failed" } });
      await recomputeJobForIntent(tx, pi.id);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      const refundId = charge.refunds?.data?.[0]?.id ?? null;
      if (piId) {
        await tx.payment.updateMany({
          where: { stripePaymentIntentId: piId },
          data: { status: "refunded", stripeRefundId: refundId },
        });
        await recomputeJobForIntent(tx, piId);
      }
      break;
    }
    default:
      // Unhandled event types are still recorded (idempotency) and marked processed.
      break;
  }
}

/** Resolve the linked Job from a PaymentIntent and recompute its status from the
 *  charge Payment rows — never stamps the event's status directly. Job existence
 *  is never touched (§6.2). */
async function recomputeJobForIntent(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  const payment = await tx.payment.findFirst({ where: { stripePaymentIntentId: paymentIntentId }, select: { jobId: true } });
  if (payment?.jobId) await recomputeJobPaymentStatus(tx, payment.jobId);
}
