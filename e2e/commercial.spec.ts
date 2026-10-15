import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./support/admin";
import { db, deleteJobCascade, testEmail } from "./support/db";

/**
 * **L11 acceptance** (PRD §16.3 → L11, §7.6): *"a commercial lead reaches an
 * active recurring contract end to end; invoice totals reconcile to jobs."*
 *
 * The contract half runs through the real screens and the real acceptance page.
 * What it cannot cover is **Bacs**: the Stripe account is not configured for
 * Bacs Direct Debit mandates (checked against the live test account, not
 * inferred), so commercial collection is by invoice and bank transfer — which is
 * what §12.5 says an invoice carries anyway.
 */

test("a commercial enquiry becomes an active recurring contract", async ({ page, context, baseURL }) => {
  const email = testEmail("commercial");

  const lead = await db.lead.create({
    data: {
      type: "commercial",
      name: "A Managing Agent",
      organisationName: "Example Property Management",
      email,
      phone: "07700 900920",
      postcode: "SW4 7AA",
      requirements: { serviceSlug: "communal-area-cleaning", addressLine1: "12 Example Court" },
      status: "new",
      source: "e2e",
    },
  });

  // ── A sent proposal, as `createProposal` + `sendProposal` would leave it ──
  // Written directly rather than through the actions: importing a "use server"
  // module into this process pulls in next-auth, which cannot load outside the
  // Next runtime. The actions are covered by the server-action auth scan; what
  // this gate is for is the customer's journey from here.
  const proposal = await db.proposal.create({
    data: {
      leadId: lead.id,
      scope: { description: "Communal areas: entrance hall, stairwells, bin store. Weekly." },
      pricePerVisit: 18000,
      frequency: "weekly",
      termMonths: 12,
      status: "sent",
      sentAt: new Date(),
    },
  });

  // ── The customer accepts, with no account ─────────────────────────────────
  await context.clearCookies();
  await page.goto(`/proposal/${proposal.id}`, { waitUntil: "domcontentloaded" });

  // They can see exactly what they are agreeing to — including the term.
  await expect(page.getByText("Example Property Management")).toBeVisible();
  await expect(page.getByText("£180.00")).toBeVisible();
  await expect(page.getByText("12 months")).toBeVisible();
  await expect(page.getByText(/bank transfer within 30 days/)).toBeVisible();

  const firstVisit = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.locator("#start-date").fill(firstVisit);
  await page.getByRole("button", { name: /Accept and book/ }).click();
  await expect(page.getByText(/Accepted — thank you/)).toBeVisible({ timeout: 30_000 });

  // ── An active recurring contract, through the SAME code the domestic path
  //    uses — not a second implementation of "recurring work" ───────────────
  const customer = await db.user.findUnique({ where: { email } });
  expect(customer, "the lead became a customer").toBeTruthy();

  const subscriptions = await db.subscription.findMany({ where: { customerId: customer!.id } });
  expect(subscriptions).toHaveLength(1);
  expect(subscriptions[0].status).toBe("active");
  expect(subscriptions[0].gross, "priced from the proposal, not the rate card").toBe(18000);
  expect(subscriptions[0].recurrenceRule).toMatch(/^FREQ=WEEKLY;BYDAY=/);

  const jobs = await db.job.findMany({ where: { subscriptionId: subscriptions[0].id } });
  expect(jobs, "the contract starts with a date in the diary").toHaveLength(1);
  expect(jobs[0].gross).toBe(18000);

  const acceptedProposal = await db.proposal.findUnique({ where: { id: proposal.id } });
  expect(acceptedProposal!.status).toBe("accepted");
  expect(acceptedProposal!.acceptedAt).toBeTruthy();
  expect(acceptedProposal!.subscriptionId).toBe(subscriptions[0].id);
  expect((await db.lead.findUnique({ where: { id: lead.id } }))!.status).toBe("converted");

  // ── Accepting twice does nothing ──────────────────────────────────────────
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Accepted — thank you/)).toBeVisible();
  expect(await db.subscription.count({ where: { customerId: customer!.id } })).toBe(1);

  // ── Invoice the completed work, and reconcile ─────────────────────────────
  await db.job.update({ where: { id: jobs[0].id }, data: { status: "completed" } });
  const organisation = await db.organisation.create({
    data: { name: "Example Property Management", billingEmail: email, paymentTerms: "net30" },
  });

  const { invoiceTotals, nextInvoiceNumber, dueDate } = await import("../src/lib/invoicing");
  const completed = await db.job.findMany({ where: { id: jobs[0].id } });
  const totals = invoiceTotals(
    completed.map((job) => ({
      id: job.id,
      gross: job.gross,
      net: job.net,
      vatAmount: job.vatAmount,
      description: "Communal area cleaning",
      date: "",
    })),
  );
  const issueDate = new Date();
  const invoice = await db.invoice.create({
    data: {
      organisationId: organisation.id,
      jobIds: completed.map((job) => job.id),
      invoiceNumber: nextInvoiceNumber(
        (await db.invoice.findMany({ select: { invoiceNumber: true } })).map((row) => row.invoiceNumber),
      ),
      issueDate,
      dueDate: dueDate(issueDate),
      net: totals.net,
      vatAmount: totals.vatAmount,
      gross: totals.gross,
      status: "issued",
    },
  });

  // The criterion: totals reconcile to the jobs.
  expect(invoice.gross).toBe(completed.reduce((sum, job) => sum + job.gross, 0));
  expect(invoice.net + invoice.vatAmount).toBe(invoice.gross);

  await signInAsOwner(context, baseURL!);
  await page.goto("/admin/invoices", { waitUntil: "domcontentloaded" });
  const row = page.locator("tr", { hasText: invoice.invoiceNumber });
  await expect(row).toBeVisible();
  await expect(row).toContainText("£180.00");
  // Not VAT registered, so no VAT number is shown — displaying one we do not
  // have would be an offence.
  await expect(page.getByText(/Not VAT registered/)).toBeVisible();
  await expect(page.getByText(/bank transfer/i)).toBeVisible();

  // Clean up.
  await db.invoice.delete({ where: { id: invoice.id } });
  await db.organisation.delete({ where: { id: organisation.id } });
  for (const job of jobs) await deleteJobCascade(job.id);
  await db.proposal.delete({ where: { id: proposal.id } });
  await db.subscription.delete({ where: { id: subscriptions[0].id } });
  await db.lead.delete({ where: { id: lead.id } });
  await db.property.deleteMany({ where: { customerId: customer!.id } });
  await db.user.delete({ where: { id: customer!.id } });
});

test("a draft proposal is not an offer and cannot be seen", async ({ page }) => {
  const lead = await db.lead.create({
    data: { type: "commercial", name: "Draft Co", email: testEmail("draft"), status: "new", source: "e2e" },
  });
  const proposal = await db.proposal.create({
    data: {
      leadId: lead.id,
      scope: { description: "Not finished" },
      pricePerVisit: 9900,
      frequency: "monthly",
      status: "draft",
    },
  });

  // Until an admin marks it sent, it is not an offer — accepting one would
  // commit us to a price nobody has checked.
  const response = await page.goto(`/proposal/${proposal.id}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);

  await db.proposal.delete({ where: { id: proposal.id } });
  await db.lead.delete({ where: { id: lead.id } });
});
