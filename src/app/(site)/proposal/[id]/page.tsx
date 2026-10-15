import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { site } from "@/config/site";
import { ProposalAccept } from "@/components/commercial/ProposalAccept";

export const metadata: Metadata = { title: "Your proposal", robots: { index: false, follow: false } };

/**
 * A commercial proposal, as the customer sees it (§7.6).
 *
 * Reached from the link in the proposal email, by someone with no account — a
 * managing agent, usually. So it shows exactly what they are agreeing to, in
 * figures: the scope, the price per visit, how often, and any minimum term. A
 * proposal that hides the term behind "standard conditions apply" is one that
 * gets disputed later.
 *
 * A draft is never shown: until an admin has marked it sent, it is not an offer.
 *
 * `params` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDatabase) notFound();

  const proposal = await db.proposal.findUnique({
    where: { id },
    include: { lead: { select: { name: true, organisationName: true } } },
  });
  if (!proposal || proposal.status === "draft") notFound();

  const scope = (proposal.scope ?? {}) as { description?: string };
  const accepted = proposal.status === "accepted";

  return (
    <section className="container-page py-16">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Proposal</p>
        <h1 className="mt-2 text-3xl font-bold">
          {proposal.lead?.organisationName ?? proposal.lead?.name ?? "Your cleaning proposal"}
        </h1>

        <div className="card mt-6 p-6">
          <h2 className="text-lg font-bold">What we would do</h2>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{scope.description ?? "Scope to be confirmed."}</p>

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-soft">Price per visit</dt>
            <dd className="font-semibold">{formatPence(proposal.pricePerVisit)}</dd>
            <dt className="text-ink-soft">How often</dt>
            <dd className="capitalize">{proposal.frequency}</dd>
            <dt className="text-ink-soft">Minimum term</dt>
            <dd>{proposal.termMonths ? `${proposal.termMonths} months` : "No minimum term"}</dd>
            <dt className="text-ink-soft">Payment</dt>
            <dd>Invoiced monthly, payable by bank transfer within 30 days</dd>
          </dl>
        </div>

        {accepted ? (
          <p className="mt-6 rounded-lg bg-brand-tint/60 px-4 py-3 text-brand-ink">
            Accepted — thank you. We will be in touch to confirm the details of your first visit.
          </p>
        ) : (
          <ProposalAccept proposalId={proposal.id} />
        )}

        <p className="mt-8 text-xs text-ink-soft">
          {site.company.registeredName}. Questions? {site.contact.email}.
        </p>
      </div>
    </section>
  );
}
