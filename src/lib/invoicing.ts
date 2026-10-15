/**
 * Commercial invoicing (§7.6, §12.5, PRD §16.3 → L11).
 *
 * Pure, because an invoice is a legal document and its arithmetic has to be
 * checkable without a database. Three rules govern everything here:
 *
 *  1. **The sequence has no gaps.** A missing number in a sales-invoice sequence
 *     is the first thing an inspector asks about, and "the software skipped it"
 *     is not an answer anyone enjoys giving.
 *  2. **The VAT number appears only when we are registered.** Showing one we do
 *     not have is an offence; omitting one we do have makes the invoice useless
 *     for the customer's own return.
 *  3. **Bank transfer appears on invoices, and nowhere else** (§12.5). It is how
 *     a commercial customer pays a net-30 invoice; it is not a checkout option
 *     for a domestic booking.
 */

import { isVatRegistered, fromGross, fromNet } from "@/lib/money";
import { site } from "@/config/site";

/** Net-30 unless an organisation says otherwise (§7.6). */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

export interface InvoiceableJob {
  id: string;
  /** What the customer was charged for this visit, in pence. */
  gross: number;
  net: number;
  vatAmount: number;
  /** For the invoice line. */
  description: string;
  /** London date of the visit, for the line. */
  date: string;
}

export interface InvoiceTotals {
  net: number;
  vatAmount: number;
  gross: number;
}

/**
 * Add up the jobs.
 *
 * Summed from the **stored** per-job figures rather than recomputed from a rate
 * card: an invoice must say what was charged, not what today's prices would
 * make it. If a rate changed between the visit and the invoice, the invoice
 * still shows the visit's own price.
 */
export function invoiceTotals(jobs: InvoiceableJob[]): InvoiceTotals {
  return jobs.reduce<InvoiceTotals>(
    (totals, job) => ({
      net: totals.net + job.net,
      vatAmount: totals.vatAmount + job.vatAmount,
      gross: totals.gross + job.gross,
    }),
    { net: 0, vatAmount: 0, gross: 0 },
  );
}

/**
 * The next invoice number in the sequence.
 *
 * Takes the highest number already issued rather than a count, so a deleted
 * draft cannot cause a reused number — two invoices with one number is worse
 * than a gap.
 */
export function nextInvoiceNumber(previousNumbers: string[], prefix = "INV"): string {
  const highest = previousNumbers
    .map((number) => Number(number.replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0);
  return `${prefix}-${String(highest + 1).padStart(5, "0")}`;
}

/** Is a run of issued numbers unbroken? Used by a test and by an admin check. */
export function sequenceGaps(numbers: string[]): number[] {
  const values = numbers
    .map((number) => Number(number.replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < values.length; i++) {
    for (let missing = values[i - 1] + 1; missing < values[i]; missing++) gaps.push(missing);
  }
  return gaps;
}

export type InvoiceState = "draft" | "issued" | "due" | "overdue" | "paid";

/**
 * What an invoice's state actually is, from its dates.
 *
 * Derived rather than stored, except for `paid` and `draft` which are facts
 * someone asserts. "Overdue" computed from a field somebody has to remember to
 * change is how a ledger ends up claiming everything is current.
 */
export function invoiceState(invoice: {
  status: string;
  dueDate: Date;
  issueDate: Date;
}, now: Date = new Date()): InvoiceState {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "draft") return "draft";
  if (now.getTime() > invoice.dueDate.getTime()) return "overdue";
  if (now.getTime() >= invoice.issueDate.getTime()) return "due";
  return "issued";
}

/** The due date for an issue date and a term. */
export function dueDate(issuedAt: Date, termDays: number = DEFAULT_PAYMENT_TERM_DAYS): Date {
  return new Date(issuedAt.getTime() + termDays * 24 * 60 * 60 * 1000);
}

/** Days overdue, or 0. For the chase list — "27 days late" is actionable, "overdue" is not. */
export function daysOverdue(due: Date, now: Date = new Date()): number {
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return Math.max(0, days);
}

export interface InvoiceFooter {
  /** Shown only when VAT-registered. */
  vatNumber: string | null;
  /** Bank details, shown on invoices only (§12.5). */
  payBy: string;
  companyLine: string;
}

/**
 * The legal footer of an invoice.
 *
 * `vatNumber` is null unless we are registered — the config holds a placeholder
 * until Fola confirms it, and a placeholder VAT number on a real invoice would
 * be worse than none.
 */
export function invoiceFooter(): InvoiceFooter {
  const registered = isVatRegistered();
  const vatNumber = registered ? (site.company.vatNumber ?? null) : null;
  return {
    vatNumber: vatNumber && !vatNumber.includes("PLACEHOLDER") ? vatNumber : null,
    payBy:
      "Payable by bank transfer using the details above, quoting the invoice number. " +
      "We do not accept cash.",
    companyLine: `${site.company.registeredName}, company number ${site.company.companyNumber}`,
  };
}

/** Split a gross figure the way the rest of the app does, for a manual line. */
export function lineMoney(grossPence: number): { net: number; vatAmount: number; gross: number } {
  const money = isVatRegistered() ? fromGross(grossPence) : fromNet(grossPence);
  return { net: money.net, vatAmount: money.vatAmount, gross: grossPence };
}
