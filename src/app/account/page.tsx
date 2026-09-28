import type { Metadata } from "next";
import { requireCustomer, signOut } from "@/lib/auth";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/account/signin" });
}

export default async function AccountPage() {
  // Ownership gate: from here, every read/action scopes by this id (piece 2).
  await requireCustomer();

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your account</h1>
        <form action={signOutAction}>
          <button className="text-sm text-ink-soft hover:text-ink">Sign out</button>
        </form>
      </div>
      <p className="mt-4 text-ink-soft">
        Your bookings, payments and any recurring plan will appear here.
      </p>
    </div>
  );
}
