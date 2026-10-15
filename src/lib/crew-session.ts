/**
 * Crew sessions (§9.2, PRD §16.3 → L5).
 *
 * A crew PIN sign-in creates a row in Auth.js's own `Session` table and sets its
 * cookie, so everything downstream — `auth()`, `requireRole`, the adapter's
 * expiry handling — works exactly as it does for a magic-link sign-in. The
 * alternative was a second, parallel notion of "signed in", which is how an app
 * ends up with one gate that is checked and one that is forgotten.
 *
 * The session is deliberately **long-lived** (§9.2: "PIN login on a persistent
 * session rather than repeated password entry"), and sign-out deliberately
 * **deletes the row** rather than only clearing the cookie — on a shared device
 * the next person must not inherit the last one's day, and a cookie cleared on
 * one phone means nothing to a session token someone else still holds.
 */

import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/db";

/**
 * How long a crew stays signed in. Long, because the alternative is a PIN typed
 * on a doorstep in the rain several times a day — and the sign-out button, the
 * lockout and the role check are what make it safe, not a short expiry.
 */
export const CREW_SESSION_DAYS = 30;

/**
 * Auth.js's cookie name for a non-secure origin. The `__Secure-` prefix is used
 * when the site is served over HTTPS, so both are handled: in production the
 * secure one is set, locally the plain one.
 */
function cookieName(): string {
  return process.env.NEXTAUTH_URL?.startsWith("https://") ||
    process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/** Create the session row and set its cookie. */
export async function startCrewSession(userId: string): Promise<void> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + CREW_SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({ data: { sessionToken, userId, expires } });

  const store = await cookies();
  const name = cookieName();
  store.set(name, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: name.startsWith("__Secure-"),
    path: "/",
    expires,
  });
}

/**
 * End the session: delete the row, then clear the cookie.
 *
 * In that order, and the row first. Clearing the cookie alone would leave a live
 * session token that anyone holding it could still use — which on a shared
 * device is precisely the person you were signing out from.
 */
export async function endCrewSession(): Promise<void> {
  const store = await cookies();
  const name = cookieName();
  const token = store.get(name)?.value;
  if (token) {
    await db.session.deleteMany({ where: { sessionToken: token } });
  }
  store.delete(name);
}
