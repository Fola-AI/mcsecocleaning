import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

/**
 * Middleware (§3, §5.1): noindex all internal routes, and gate /admin behind the
 * interim admin access code (deny-by-default). Auth.js RBAC replaces the /admin
 * gate — and adds /crew and /account protection — once a DB is live.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const expected = process.env.ADMIN_ACCESS_CODE;
    const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!expected || cookie !== expected) {
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
