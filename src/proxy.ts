import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (§3, §5.1): noindex every internal route, and bounce unauthenticated
 * /admin requests to sign-in. This is a COARSE convenience gate only — it checks
 * merely for a session cookie's presence (edge-safe, no DB). The authoritative
 * check is `requireRole` at the top of every admin page and server action, which
 * verifies the session and the role on the data path (§3: hiding UI is not access
 * control). /crew and /account gain the same requireRole treatment with their
 * surfaces (Phase 2/3).
 *
 * Next 16 renamed the `middleware` file convention to `proxy` — same behaviour,
 * new name (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  // The staff areas are never cached, and `no-store` rather than
  // `must-revalidate`: the crew app runs on shared phones (§9.2), where a page
  // left in the back/forward cache is the previous person's day — their
  // customer's address, their job list. Set here rather than in
  // `next.config.ts` because a route's own metadata was overriding the config
  // header for /crew, which the hardening gate caught.
  if (pathname.startsWith("/admin") || pathname.startsWith("/crew") || pathname.startsWith("/account")) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasSession =
      req.cookies.get("authjs.session-token")?.value ||
      req.cookies.get("__Secure-authjs.session-token")?.value;
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  // The bare paths are listed as well as `:path*`. `"/crew/:path*"` alone did
  // not match `/crew` itself — the page an operator actually opens — so the
  // no-store header was never applied to it. The hardening gate caught it.
  matcher: [
    "/admin",
    "/admin/:path*",
    "/crew",
    "/crew/:path*",
    "/account",
    "/account/:path*",
    "/book",
  ],
};
