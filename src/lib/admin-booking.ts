/**
 * The admin's result message. A payment-link booking whose link never came back
 * (Stripe error, or Stripe not configured) says so explicitly — plain "Booking
 * created" would leave the admin thinking there's a link to send when there isn't.
 */
export function bookingCreatedMessage(paymentMethod: string, paymentUrl: string | null | undefined): string {
  if (paymentUrl) return "Booking created — send the customer the payment link.";
  if (paymentMethod === "payment_link") {
    return "Booking created, but the payment link could NOT be created — there is no link to send. No card has been charged. Take payment another way (e.g. invoice) for this booking.";
  }
  return "Booking created.";
}
