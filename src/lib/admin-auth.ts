import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * INTERIM admin gate (§3, §6.15). Real RBAC is Auth.js magic-link + server-side
 * role checks (the chosen provider) and replaces this once a database is live.
 * Until then, /admin is protected by a shared access code so it is never public.
 *
 * Deny-by-default: if ADMIN_ACCESS_CODE is unset, the admin area is disabled.
 *
 * TODO(auth): replace with Auth.js session + role === owner/admin. RBAC MUST be
 * enforced on every route and every data query — hiding UI is not access control.
 */

export const ADMIN_COOKIE = "mcs_admin";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminCodeConfigured(): boolean {
  return Boolean(process.env.ADMIN_ACCESS_CODE);
}

export function checkAdminCode(code: string): boolean {
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) return false;
  return timingSafeEqual(code, expected);
}

export async function isAdmin(): Promise<boolean> {
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) return false;
  const c = await cookies();
  const val = c.get(ADMIN_COOKIE)?.value;
  return Boolean(val && timingSafeEqual(val, expected));
}

/** Guard for admin pages and server actions. Redirects to login if not admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/**
 * Server-side identity for audit fields (e.g. Quote.overrideBy, §9.7). Derived
 * here, NEVER from anything the client submits — an audit field that trusts the
 * request can lie. Under the interim shared-code gate there is no individual, so
 * it returns a constant marker; it upgrades to the real session user id when
 * Auth.js RBAC replaces this gate (this is the single point of change).
 */
export async function currentAdminActor(): Promise<string> {
  return "shared-admin"; // interim: shared access code, not a named person (see TODO(auth))
}
