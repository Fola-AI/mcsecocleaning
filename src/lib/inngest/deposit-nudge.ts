import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { site } from "@/config/site";
import { formatPence } from "@/lib/money";

/**
 * Nudge customers whose deposit is paid but whose balance was never authorised
 * (§6.5/§6.13). Without this, a customer who closes the page after the deposit
 * depends on someone spotting the part_paid job in admin — which, on a slim team,
 * is the thing that won't happen.
 *
 * Runs daily. Emails the pending BALANCE charge on a part_paid job (deposit
 * captured, balance never confirmed) that is 24–48h old. That 24h-wide window on
 * a 24h cadence means each such payment is caught on exactly one run — nudged
 * once, with no "nudged" marker column needed (exactly-once would otherwise be a
 * schema touchpoint). An authorised balance is excluded (it's secured, captured
 * on completion); only truly-incomplete balances are nudged.
 */
export const nudgeIncompleteDeposits = inngest.createFunction(
  { id: "nudge-incomplete-deposits", name: "Nudge unpaid balances (deposit paid, balance outstanding)", triggers: [{ cron: "0 10 * * *" }] },
  async () => {
    if (!hasDatabase) {
      console.log("[nudge] no database configured — skipping");
      return { skipped: true };
    }

    const now = Date.now();
    const windowStart = new Date(now - 48 * 60 * 60 * 1000); // 48h ago
    const windowEnd = new Date(now - 24 * 60 * 60 * 1000); // 24h ago

    const pending = await db.payment.findMany({
      where: {
        type: "charge",
        status: "pending",
        createdAt: { gte: windowStart, lt: windowEnd },
        job: { is: { paymentStatus: "part_paid" } },
      },
      include: { job: { include: { customer: true, serviceType: true } } },
    });

    let nudged = 0;
    for (const p of pending) {
      const email = p.job?.customer?.email;
      if (!email) continue;
      const serviceName = p.job?.serviceType?.name ?? "your clean";
      await sendEmail({
        to: email,
        subject: "Your deposit is paid — one step left to confirm your booking",
        html: `
          <h2>Almost there</h2>
          <p>Thanks — your deposit for ${serviceName} is paid and held. We just need to authorise the
          remaining balance of <strong>${formatPence(p.gross)}</strong> to lock in your slot.</p>
          <p>Reply to this email or call us on <a href="tel:${site.contact.phone}">${site.contact.phoneDisplay}</a>
          and we'll complete it in a moment. Your deposit stays refundable within your 14-day
          cancellation period until the clean takes place.</p>
          <p style="font-size:12px;color:#555">${site.company.registeredName}</p>
        `,
      });
      nudged++;
    }

    console.log(`[nudge] emailed ${nudged} customers with an outstanding balance`);
    return { nudged };
  }
);
