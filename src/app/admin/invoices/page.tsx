import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { daysOverdue, invoiceFooter, invoiceState, sequenceGaps } from "@/lib/invoicing";
import { InvoicePaidButton } from "@/components/admin/InvoicePaidButton";

export const metadata: Metadata = { title: "Invoices", robots: { index: false, follow: false } };

/**
 * Commercial invoices (§7.6, §12.5).
 *
 * Ordered **oldest overdue first**, because that is the order they should be
 * chased in, and each line says how many days late rather than just "overdue" —
 * "27 days late" gets a payment, "overdue" gets ignored.
 *
 * The sequence is checked on every load. A gap in a sales-invoice sequence is
 * the first thing an inspector asks about, and the time to notice one is now,
 * not at year end.
 */
export default async function AdminInvoicesPage() {
  await requireRole(["owner", "admin"]);

  const now = new Date();
  const invoices = hasDatabase
    ? await db.invoice.findMany({
        orderBy: [{ dueDate: "asc" }],
        take: 200,
        include: { organisation: { select: { name: true, vatNumber: true } } },
      })
    : [];

  const gaps = sequenceGaps(invoices.map((invoice) => invoice.invoiceNumber));
  const footer = invoiceFooter();
  const outstanding = invoices.filter((invoice) => invoice.status !== "paid");

  return (
    <AdminShell title="Invoices">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected.
        </p>
      )}

      {gaps.length > 0 && (
        <p className="mb-6 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
          The invoice sequence has {gaps.length} gap{gaps.length === 1 ? "" : "s"} (missing{" "}
          {gaps.slice(0, 10).join(", ")}). Numbers should run unbroken — this is worth explaining before anyone
          asks.
        </p>
      )}

      {invoices.length === 0 ? (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          No invoices yet. They are raised from completed commercial jobs.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {outstanding.length} unpaid —{" "}
            {formatPence(outstanding.reduce((sum, invoice) => sum + invoice.gross, 0))} outstanding.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="py-2 pr-4">Number</th>
                  <th className="py-2 pr-4">Organisation</th>
                  <th className="py-2 pr-4">Issued</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Jobs</th>
                  <th className="py-2 pr-4">Net</th>
                  <th className="py-2 pr-4">VAT</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">State</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const state = invoiceState(invoice, now);
                  const late = daysOverdue(invoice.dueDate, now);
                  return (
                    <tr key={invoice.id} className="border-b border-line">
                      <td className="py-3 pr-4 font-mono">{invoice.invoiceNumber}</td>
                      <td className="py-3 pr-4">{invoice.organisation?.name ?? "—"}</td>
                      <td className="py-3 pr-4">{localDateString(invoice.issueDate)}</td>
                      <td className="py-3 pr-4">{localDateString(invoice.dueDate)}</td>
                      <td className="py-3 pr-4">{invoice.jobIds.length}</td>
                      <td className="py-3 pr-4">{formatPence(invoice.net)}</td>
                      <td className="py-3 pr-4">{formatPence(invoice.vatAmount)}</td>
                      <td className="py-3 pr-4 font-semibold">{formatPence(invoice.gross)}</td>
                      <td className="py-3 pr-4">
                        <span className={state === "overdue" ? "text-error" : ""}>
                          {state}
                          {state === "overdue" && ` · ${late} day${late === 1 ? "" : "s"} late`}
                        </span>
                        {state !== "paid" && (
                          <span className="mt-1 block">
                            <InvoicePaidButton invoiceId={invoice.id} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 max-w-2xl text-xs text-ink-soft">
            {footer.payBy} {footer.vatNumber ? `VAT number ${footer.vatNumber}.` : "Not VAT registered — no VAT is charged and none is shown."}
          </p>
        </>
      )}
    </AdminShell>
  );
}
