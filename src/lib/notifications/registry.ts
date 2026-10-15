/**
 * The §10.3 notification matrix, as data (PRD §16.3 → L9).
 *
 * §10.3 is a table of thirteen rows: trigger, channel, recipient. Written out as
 * thirteen call sites it cannot be checked — the acceptance criterion is *"a
 * test per trigger"*, and "did we build the subscription-lapsing email?" has no
 * answer you can compute from scattered code.
 *
 * So the matrix is one list. Every sender declares itself here, the PECR gate
 * reads `marketing` from here, and a test walks the table and fails if a row of
 * §10.3 has no sender.
 *
 * ## Marketing versus transactional, and why it is in this file
 *
 * PECR gates **marketing**. A booking confirmation is not marketing however
 * cheerful it is, and a review request is — it asks the customer to do something
 * for the business's benefit. Getting that wrong in either direction is a
 * problem: gate a confirmation and the customer does not learn their clean is
 * booked; fail to gate a review request and it is a breach. Marking it per
 * trigger, next to the trigger, is the only version of this that stays correct.
 */

export type NotificationChannel = "email" | "sms";
export type NotificationAudience = "customer" | "crew" | "admin";

export interface NotificationTrigger {
  /** Stable id. Also the prefix of the dedupe key. */
  id: string;
  /** The §10.3 row, verbatim enough to be matched against it. */
  label: string;
  channels: NotificationChannel[];
  audience: NotificationAudience;
  /**
   * True when PECR applies: the message asks something of the customer for the
   * business's benefit, rather than telling them something about a service they
   * have bought.
   */
  marketing: boolean;
  /** Why this classification, for whoever questions it later. */
  note?: string;
}

export const NOTIFICATION_TRIGGERS: NotificationTrigger[] = [
  {
    id: "booking_confirmed",
    label: "Booking confirmed",
    channels: ["email", "sms"],
    audience: "customer",
    marketing: false,
    note: "They have just paid us; confirming it is the service, not promotion.",
  },
  {
    id: "pre_contract",
    label: "Pre-contract information",
    channels: ["email"],
    audience: "customer",
    marketing: false,
    note: "A legal duty in a durable medium (§14) — it is sent whatever the consent state.",
  },
  {
    id: "reminder_24h",
    label: "Reminder, 24h before",
    channels: ["email", "sms"],
    audience: "customer",
    marketing: false,
  },
  {
    id: "crew_on_the_way",
    label: "Crew on the way",
    channels: ["sms"],
    audience: "customer",
    marketing: false,
  },
  {
    id: "job_completed",
    label: "Job completed + media link",
    channels: ["email", "sms"],
    audience: "customer",
    marketing: false,
  },
  {
    id: "review_request",
    label: "Review request, 24h after",
    channels: ["email", "sms"],
    audience: "customer",
    marketing: true,
    note: "Asks the customer to do something for us — PECR applies, and DMCC 2024 forbids gating who is asked (§10.1).",
  },
  {
    id: "payment_failed",
    label: "Payment failed",
    channels: ["email"],
    audience: "customer",
    marketing: false,
  },
  {
    id: "subscription_lapsing",
    label: "Subscription lapsing",
    channels: ["email"],
    audience: "customer",
    marketing: true,
    note: "A win-back: it exists to keep revenue, so it is marketing even though it concerns their own plan.",
  },
  {
    id: "recurring_visit_3d",
    label: "Recurring visit, 3 days before (with skip link)",
    channels: ["sms"],
    audience: "customer",
    marketing: false,
    note: "Operational: it tells them we are coming and lets them skip.",
  },
  {
    id: "crew_new_assignment",
    label: "New assignment",
    channels: ["sms"],
    audience: "crew",
    marketing: false,
  },
  {
    id: "crew_schedule_change",
    label: "Schedule change",
    channels: ["sms"],
    audience: "crew",
    marketing: false,
  },
  {
    id: "admin_complaint",
    label: "Complaint raised",
    channels: ["email"],
    audience: "admin",
    marketing: false,
  },
  {
    id: "admin_job_stuck",
    label: "Job stuck in progress",
    channels: [],
    audience: "admin",
    marketing: false,
    note: "Dashboard only — an alert nobody can act on at 2am is noise, and it is already on the Today view.",
  },
];

export function triggerById(id: string): NotificationTrigger | undefined {
  return NOTIFICATION_TRIGGERS.find((trigger) => trigger.id === id);
}

/** Marketing triggers — the ones PECR gates. */
export function marketingTriggers(): NotificationTrigger[] {
  return NOTIFICATION_TRIGGERS.filter((trigger) => trigger.marketing);
}

/** The dedupe key for one message about one thing. */
export function dedupeKey(triggerId: string, channel: NotificationChannel, subjectId: string): string {
  return `${triggerId}:${channel}:${subjectId}`;
}
