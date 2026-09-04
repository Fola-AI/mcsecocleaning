import type { Metadata } from "next";
import { adminCodeConfigured } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  const configured = adminCodeConfigured();
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Interim access gate. Replaced by Auth.js magic-link + role-based access once a database is live.
      </p>
      {!configured ? (
        <p className="mt-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          Admin is disabled: set <code>ADMIN_ACCESS_CODE</code> in the environment to enable it.
        </p>
      ) : (
        <div className="mt-6">
          <LoginForm />
        </div>
      )}
    </div>
  );
}
