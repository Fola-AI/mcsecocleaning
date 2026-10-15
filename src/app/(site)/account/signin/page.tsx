import type { Metadata } from "next";
import { signIn } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in to your account", robots: { index: false, follow: false } };

/** Customer magic-link sign-in. Same provider as admin; role decides what you see.
 *  An account is optional — offered after the first booking (§7.1). */
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("resend", { email, redirectTo: "/account" });
}

export default function AccountSignInPage() {
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-2xl font-bold">Your account</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Enter the email you booked with and we&apos;ll send you a secure sign-in link — no password. You&apos;ll see your
        bookings, payments and any recurring plan.
      </p>
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
