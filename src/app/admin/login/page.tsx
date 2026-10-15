import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { checkSignInRateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

/** Magic-link sign-in. Only users whose role passes requireRole reach /admin;
 *  the link itself just authenticates the identity (§3, §13). */
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  // §13.3 rate limiting, before anything is sent: a magic-link form that will
  // email anybody on demand is a way to flood a stranger's inbox with our name
  // on it. Refusal redirects rather than throwing, so the page can say so
  // without this needing to be a client component.
  if (await checkSignInRateLimit(await headers(), email)) redirect("/admin/login?slow=1");
  await signIn("resend", { email, redirectTo: "/admin" });
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ slow?: string }>;
}) {
  const { slow } = await searchParams;
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Enter your email and we&apos;ll send you a secure sign-in link. Access to the admin area depends on your role.
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
