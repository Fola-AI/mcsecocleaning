import type { Metadata } from "next";

import { db, hasDatabase } from "@/lib/db";
import { userIdFromToken } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/**
 * One-click unsubscribe (§10.3, §14).
 *
 * It takes effect on **GET**, with no confirmation step. That is deliberate: a
 * customer who clicked unsubscribe has told us what they want, and an extra
 * "are you sure?" is the pattern that makes people mark mail as spam instead.
 * It is safe to do on a GET because the token is signed, so the link cannot be
 * forged for someone else, and because the action is reversible from the
 * account page.
 *
 * `searchParams` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const secret = process.env.AUTH_SECRET ?? "";
  const userId = raw && secret ? userIdFromToken(raw, secret) : null;

  let done = false;
  if (userId && hasDatabase) {
    // One field, every channel (§10.3): this also stops marketing SMS.
    const updated = await db.user.updateMany({
      where: { id: userId },
      data: { marketingConsent: false, consentUpdatedAt: new Date() },
    });
    done = updated.count > 0;
  }

  return (
    <section className="container-page py-20">
      <div className="mx-auto max-w-lg text-center">
        {done ? (
          <>
            <h1 className="text-3xl font-bold">You&apos;re unsubscribed</h1>
            <p className="mt-3 text-ink-soft">
              We won&apos;t send you marketing again — by email or text. You will still get the messages about a
              clean you have booked: confirmations, reminders and receipts.
            </p>
            <p className="mt-3 text-sm text-ink-soft">
              Changed your mind? You can turn it back on in your account at any time.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">That link didn&apos;t work</h1>
            <p className="mt-3 text-ink-soft">
              It may have been copied incompletely. You can unsubscribe from your account, or reply to any of our
              emails and we will do it for you.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
