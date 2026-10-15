import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { checkSignInRateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Sign in to your account", robots: { index: false, follow: false } };

/** Customer magic-link sign-in. Same provider as admin; role decides what you see.
 *  An account is optional — offered after the first booking (§7.1). */
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  // §13.3 rate limiting, before anything is sent: a magic-link form that will
  // email anybody on demand is a way to flood a stranger's inbox with our name
  // on it. Refusal redirects rather than throwing, so the page can say so
  // without this needing to be a client component.
  if (await checkSignInRateLimit(await headers(), email)) redirect("/account/signin?slow=1");
  await signIn("resend", { email, redirectTo: "/account" });
}

export default async function AccountSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ slow?: string }>;
}) {
  const { slow } = await searchParams;
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-2xl font-bold">Your account</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Enter the email you booked with and we&apos;ll send you a secure sign-in link — no password. You&apos;ll see your
        bookings, payments and any recurring plan.
      </p>
      {slow ? (
        <p role="status" className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          Too many sign-in requests from here. Please wait a few minutes and try again.
        </p>
      ) : null}
      <form action={requestMagicLink} className="card mt-6 space-y-4 p-6">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">Email me a sign-in link</button>
      </form>
    </div>
  );
}
