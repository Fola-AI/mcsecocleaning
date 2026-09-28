import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Auth.js (§3, §13). Passwordless magic-link (Resend) with DATABASE sessions, so
 * a user's role is read fresh from the DB on every request — a role change or
 * de-provision takes effect immediately. Customers and admin/owner/ops share this
 * one identity; role (on User) decides what each may reach. Crew PIN provider
 * lands with the crew app (Phase 3).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: { signIn: "/admin/login" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "mcsecocleaning <onboarding@resend.dev>",
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role: Role }).role;
      }
      return session;
    },
  },
});

/**
 * Server-side role gate — the FIRST line of every protected page and server
 * action. §3: access is enforced on the data path, never by hiding UI. Redirects
 * to sign-in when there is no session or the role isn't allowed.
 */
export async function requireRole(roles: Role[]): Promise<{ id: string; role: Role }> {
  const session = await auth();
  const id = session?.user?.id;
  const role = session?.user?.role;
  if (!id || !role || !roles.includes(role)) redirect("/admin/login");
  return { id, role };
}

/**
 * Server-side audit identity (§9.7 Quote.overrideBy). The authenticated user id
 * from the session — NEVER anything the client submits. (Pre-RBAC rows recorded
 * "shared-admin"; those stay as honest records of the interim gate.)
 */
export async function currentAdminActor(): Promise<string> {
  const session = await auth();
  return session?.user?.id ?? "unknown";
}

/**
 * Ownership gate for the customer account (§3). Returns the signed-in customer's
 * id, which is the ONLY thing /account reads and writes should scope by — every
 * query uses `where: { customerId }`, never an id from the request. A customer
 * therefore can only ever reach their own data. Redirects to the account sign-in
 * when not signed in as a customer.
 */
export async function requireCustomer(): Promise<{ id: string }> {
  const session = await auth();
  const id = session?.user?.id;
  const role = session?.user?.role;
  if (!id || role !== "customer") redirect("/account/signin");
  return { id };
}
