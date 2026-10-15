import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAYMENT_TERM_DAYS,
  daysOverdue,
  dueDate,
  invoiceFooter,
  invoiceState,
  invoiceTotals,
  nextInvoiceNumber,
  sequenceGaps,
  type InvoiceableJob,
} from "./invoicing";

/**
 * An invoice is a legal document. These tests cover the three things that make
 * one defensible: the sequence has no gaps, the totals are the jobs', and the
 * VAT number is there exactly when we are entitled to show one.
 */

function job(over: Partial<InvoiceableJob> = {}): InvoiceableJob {
  return {
    id: "j1",
    gross: 12000,
    net: 12000,
    vatAmount: 0,
    description: "Communal area cleaning",
    date: "2026-10-05",
    ...over,
  };
}

describe("totals reconcile to the jobs", () => {
  test("the sum is the sum", () => {
    const totals = invoiceTotals([job(), job({ id: "j2", gross: 8000, net: 8000 })]);
    assert.equal(totals.gross, 20000);
    assert.equal(totals.net, 20000);
  });

  test("VAT is carried from the jobs, not recomputed", () => {
    // An invoice must say what was CHARGED. If a rate changed between the visit
    // and the invoice, the invoice still shows the visit's own figures.
    const totals = invoiceTotals([
      job({ gross: 12000, net: 10000, vatAmount: 2000 }),
      job({ id: "j2", gross: 6000, net: 5000, vatAmount: 1000 }),
    ]);
    assert.equal(totals.net, 15000);
    assert.equal(totals.vatAmount, 3000);
    assert.equal(totals.gross, 18000);
    assert.equal(totals.net + totals.vatAmount, totals.gross, "net + VAT = gross, exactly");
  });

  test("an empty invoice is zero, not NaN", () => {
    assert.deepEqual(invoiceTotals([]), { net: 0, vatAmount: 0, gross: 0 });
  });
});

describe("the sequence", () => {
  test("starts at one and increments", () => {
    assert.equal(nextInvoiceNumber([]), "INV-00001");
    assert.equal(nextInvoiceNumber(["INV-00001"]), "INV-00002");
  });

  test("takes the highest, not the count — a deleted draft cannot reuse a number", () => {
    // Two invoices sharing a number is worse than a gap.
    assert.equal(nextInvoiceNumber(["INV-00001", "INV-00003"]), "INV-00004");
  });

  test("ignores anything unparseable rather than restarting", () => {
    assert.equal(nextInvoiceNumber(["INV-00007", "DRAFT", ""]), "INV-00008");
  });

  test("gaps are detectable, because an inspector will ask", () => {
    assert.deepEqual(sequenceGaps(["INV-00001", "INV-00002", "INV-00003"]), []);
    assert.deepEqual(sequenceGaps(["INV-00001", "INV-00004"]), [2, 3]);
  });
});

describe("state from dates, not from a field someone must remember", () => {
  const issueDate = new Date("2026-10-01T00:00:00Z");
  const due = dueDate(issueDate);

  test("net 30 by default", () => {
    assert.equal(
      Math.round((due.getTime() - issueDate.getTime()) / 86_400_000),
      DEFAULT_PAYMENT_TERM_DAYS,
    );
  });

  test("due while inside the term, overdue after it", () => {
    assert.equal(invoiceState({ status: "issued", issueDate, dueDate: due }, new Date("2026-10-15T00:00:00Z")), "due");
    assert.equal(invoiceState({ status: "issued", issueDate, dueDate: due }, new Date("2026-11-05T00:00:00Z")), "overdue");
  });

  test("paid and draft are facts somebody asserts, and win", () => {
    assert.equal(invoiceState({ status: "paid", issueDate, dueDate: due }, new Date("2027-01-01T00:00:00Z")), "paid");
    assert.equal(invoiceState({ status: "draft", issueDate, dueDate: due }, new Date("2027-01-01T00:00:00Z")), "draft");
  });

  test("days overdue is a number someone can act on", () => {
    // "27 days late" gets a payment; "overdue" gets ignored. Due 31 Oct, so
    // 27 November is 27 days past it.
    assert.equal(daysOverdue(due, new Date("2026-11-27T00:00:00Z")), 27);
    assert.equal(daysOverdue(due, new Date("2026-10-15T00:00:00Z")), 0);
  });
});

describe("the footer", () => {
  const footer = invoiceFooter();

  test("no VAT number while unregistered — showing one we do not have is an offence", () => {
    assert.equal(footer.vatNumber, null);
  });

  test("bank transfer is named as the way to pay, and cash is refused (§12.5)", () => {
    assert.match(footer.payBy, /bank transfer/i);
    assert.match(footer.payBy, /do not accept cash/i);
  });

  test("the company line identifies us properly", () => {
    assert.match(footer.companyLine, /company number/);
  });
});
