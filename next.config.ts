import type { NextConfig } from "next";
import { assertIndexingConfigFromEnv } from "./src/lib/seo/indexing-guard";

// Fail the build if a production deploy to a real custom domain would ship with
// indexing switched off (§6 launch safety). A checklist does not survive a late
// deploy; this does. The *.vercel.app test deploy is unaffected.
assertIndexingConfigFromEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Core Web Vitals: serve modern formats, explicit sizes at usage sites (§5.1).
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    /**
     * Security headers (§13.3, L14).
     *
     * The CSP is written out rather than generated, so what is allowed is
     * readable in one place. Four entries need explaining, and the first one is
     * a genuine limitation rather than a thing that merely looks like one:
     *
     *  - **`'unsafe-inline'` in `script-src` is a real hole, and it is open.**
     *    With it, this CSP mitigates nothing against an injected inline script;
     *    it still constrains which external origins can be loaded, which is
     *    worth having, but it is not XSS protection. Closing it means a nonce
     *    on Next's own bootstrap scripts, and a nonce has to be generated per
     *    request — which makes every page dynamically rendered and gives up the
     *    static rendering the marketing site depends on for its Core Web
     *    Vitals. That trade is a decision above this file: it is written up in
     *    `docs/SECURITY-REVIEW.md` §7 and listed there as an accepted residual
     *    risk, NOT as a hole that is really closed. (An earlier version of this
     *    comment claimed inline script "is not allowed". It was wrong, and a
     *    comment that inverts the posture is worse than no comment.)
     *  - `js.stripe.com`, `*.stripe.com` and `m.stripe.network` in `script-src`
     *    and `frame-src`: Stripe Elements runs in Stripe's own iframes and the
     *    card form does not load without them. `m.stripe.network` is listed
     *    EXPLICITLY because `*.stripe.com` does not cover it — a different
     *    registrable domain — and `r.stripe.com` is in `connect-src` for the
     *    same reason: Stripe.js posts telemetry there. The alternative is
     *    handling card numbers ourselves, which is far worse.
     *  - `'unsafe-inline'` in `style-src`: Next inlines critical CSS, and
     *    nonce-ing it has the same cost as above. Inline style is a far smaller
     *    risk than inline script.
     *  - `'unsafe-eval'` is allowed in **development only**. React's dev build
     *    uses `eval` for debugging features (reconstructing call stacks), and
     *    without it the dev overlay fails noisily — which is what happened when
     *    this was first written without the exception. Production ships without
     *    it, which is where it matters, and the gate asserts the production
     *    value has none.
     */
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = [
      "script-src 'self' 'unsafe-inline'",
      isDev ? "'unsafe-eval'" : "",
      "https://js.stripe.com https://*.stripe.com https://m.stripe.network https://www.googletagmanager.com",
    ]
      .filter(Boolean)
      .join(" ");

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://*.stripe.com https://www.googletagmanager.com",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://api.stripe.com https://*.stripe.com https://r.stripe.com https://www.google-analytics.com",
      "frame-src https://js.stripe.com https://*.stripe.com https://m.stripe.network https://hooks.stripe.com",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp },
          // Two years, with subdomains and preload — the standard that makes a
          // domain eligible for the HSTS preload list. Only meaningful over
          // HTTPS, which production is and localhost is not.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Nothing here needs a camera, a microphone or a location. The crew
          // app asks for geolocation in the BROWSER, which this does not block —
          // it blocks third-party frames from asking.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      // The admin and crew areas are never indexed and never cached. Listed per
      // area with `:path*` rather than as one alternation: the combined form
      // matched `/admin/jobs` but NOT `/admin` itself, which is the page an
      // operator actually opens — caught by the gate below.
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/crew/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
