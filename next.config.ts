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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
