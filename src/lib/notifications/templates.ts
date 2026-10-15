/**
 * What each §10.3 notification actually says (PRD §16.3 → L9).
 *
 * Kept together and kept pure, so the one rule that governs all of them can be
 * tested in one place: **an access code never appears in a message body**
 * (§9.3, §6.9, `CLAUDE.md`). None of these functions takes a property's access
 * fields, which is the structural version of that promise — a template cannot
 * leak what it is never handed.
 *
 * The SMS bodies are short on purpose: §10.3 budgets about 4p a message, and a
 * message that runs to two segments costs twice as much to say the same thing.
 * They also carry no promotional content, because transactional messages that
 * advertise are how a business loses the right to send them at all.
 */

import { site } from "@/config/site";

export interface VisitContext {
  customerName: string | null;
  serviceName: string;
  /** Already formatted for London, e.g. "Tue 3 Nov". */
  when: string;
  /** Already formatted, e.g. "09:00". */
  time?: string;
  /** Absolute URL for the customer's account. */
  accountUrl: string;
}

const greeting = (name: string | null) => (name ? `Hi ${name.split(" ")[0]},` : "Hello,");

/** A plain, consistent email wrapper — no promotional furniture. */
function emailShell(body: string): string {
  return `${body}
      <p style="font-size:12px;color:#555">${site.company.registeredName}</p>`;
}

export const templates = {
  reminder24hEmail(context: VisitContext): { subject: string; html: string } {
    return {
      subject: `Your ${context.serviceName} is tomorrow`,
      html: emailShell(`
      <h2>See you tomorrow</h2>
      <p>${greeting(context.customerName)} this is a reminder that your ${context.serviceName} is on ${context.when}${
        context.time ? ` at ${context.time}` : ""
      }.</p>
      <p>If you need to change it, you can do that in your account:</p>
      <p><a href="${context.accountUrl}">Manage your booking</a></p>`),
    };
  },

  reminder24hSms(context: VisitContext): string {
    return `${site.name}: your ${context.serviceName} is ${context.when}${
      context.time ? ` at ${context.time}` : ""
    }. Change it: ${context.accountUrl}`;
  },

  crewOnTheWaySms(): string {
    // No name, no address, no time: the customer knows which clean this is, and
    // a text that recites their address is one more copy of it in the world.
    return `${site.name}: your cleaner is on the way and should be with you shortly.`;
  },

  recurringVisit3dSms(context: VisitContext & { skipUrl: string }): string {
    // The skip link is the point of this message (§7.3): a customer who cannot
    // skip a visit easily cancels the plan instead.
    return `${site.name}: your next clean is ${context.when}${
      context.time ? ` at ${context.time}` : ""
    }. Not needed this time? Skip it: ${context.skipUrl}`;
  },

  subscriptionLapsingEmail(context: VisitContext): { subject: string; html: string } {
    return {
      subject: "Your cleaning plan is paused",
      html: emailShell(`
      <h2>Your plan is paused</h2>
      <p>${greeting(context.customerName)} your ${context.serviceName} plan is paused, so no visits are being booked.</p>
      <p>Starting it again takes one click, and your price is unchanged:</p>
      <p><a href="${context.accountUrl}">Restart my plan</a></p>`),
    };
  },

  reviewRequestEmail(context: VisitContext & { reviewUrl?: string }): { subject: string; html: string } {
    return {
      subject: "How did we do?",
      html: emailShell(`
      <h2>How did we do?</h2>
      <p>${greeting(context.customerName)} thank you for having us on ${context.when}.</p>
      <p>If you have a minute, we would be grateful for your honest view — good or bad, it helps us and it helps the next person choosing.</p>
      ${
        context.reviewUrl
          ? `<p><a href="${context.reviewUrl}">Leave a review</a></p>`
          : `<p>Just reply to this email and tell us how it went.</p>`
      }
      <p style="font-size:12px;color:#555">You are receiving this because you agreed to hear from us. <a href="${context.accountUrl}">Change that any time</a>.</p>`),
    };
  },

  reviewRequestSms(context: VisitContext & { reviewUrl?: string }): string {
    return `${site.name}: thanks for having us. How did we do? ${
      context.reviewUrl ?? context.accountUrl
    } Reply STOP to opt out.`;
  },

  crewAssignmentSms(context: { serviceName: string; when: string; time?: string; postcode: string }): string {
    return `${site.name}: new job ${context.when}${context.time ? ` ${context.time}` : ""} — ${
      context.serviceName
    }, ${context.postcode}. Details in the crew app.`;
  },

  crewScheduleChangeSms(context: { serviceName: string; when: string; time?: string; postcode: string }): string {
    return `${site.name}: a job has changed — ${context.serviceName}, ${context.postcode}, now ${context.when}${
      context.time ? ` ${context.time}` : ""
    }. Check the crew app.`;
  },

  adminComplaintEmail(context: {
    customerName: string | null;
    serviceName: string;
    when: string;
    issueType: string;
    message: string;
    jobUrl: string;
  }): { subject: string; html: string } {
    return {
      subject: `Complaint raised — ${context.serviceName}, ${context.when}`,
      html: emailShell(`
      <h2>A complaint has been raised</h2>
      <p><strong>${context.issueType.replaceAll("_", " ")}</strong> on the ${context.serviceName} for ${
        context.customerName ?? "a customer"
      } on ${context.when}.</p>
      <blockquote>${context.message}</blockquote>
      <p><a href="${context.jobUrl}">Open the job</a></p>`),
    };
  },
} as const;
