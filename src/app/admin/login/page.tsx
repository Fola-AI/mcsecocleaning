import type { Metadata } from "next";
import { signIn } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

/** Magic-link sign-in. Only users whose role passes requireRole reach /admin;
 *  the link itself just authenticates the identity (§3, §13). */
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("resend", { email, redirectTo: "/admin" });
}

export default function AdminLoginPage() {
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Enter your email and we&apos;ll send you a secure sign-in link. Access to the admin area depends on your role.
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
