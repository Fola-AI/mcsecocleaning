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
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

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
  matcher: ["/admin/:path*", "/crew/:path*", "/account/:path*", "/book"],
};
