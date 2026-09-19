/**
 * Build-time indexing guard (§6, launch safety).
 *
 * The whole site ships `noindex` unless NEXT_PUBLIC_ALLOW_INDEXING === "true"
 * (see metadata.ts / robots.ts). That is correct for the *.vercel.app test
 * deploy but business-ending if it ships to the real public domain unchanged.
 *
 * A deploy checklist does not survive a late-Friday deploy, so we FAIL THE BUILD
 * instead: if this is a Vercel production deploy whose production domain is a
 * real custom domain (not *.vercel.app) and indexing is still off, the build
 * throws. The test deploy (production alias mcsecocleaning.vercel.app) is
 * allowed to stay noindex and builds normally.
 *
 * This function is pure so it can be unit-tested; next.config.ts calls the
 * env-reading wrapper below.
 */

export interface IndexingEnv {
  /** VERCEL_ENV: "production" | "preview" | "development" | undefined (local). */
  vercelEnv?: string;
  /** VERCEL_PROJECT_PRODUCTION_URL: the project's production domain. */
  productionUrl?: string;
  /** NEXT_PUBLIC_ALLOW_INDEXING. */
  allowIndexing?: string;
}

export interface GuardResult {
  ok: boolean;
  error?: string;
}

export function checkIndexingConfig(env: IndexingEnv): GuardResult {
  const isProduction = env.vercelEnv === "production";
  const prodUrl = (env.productionUrl ?? "").trim().toLowerCase();
  const isCustomDomain = prodUrl !== "" && !prodUrl.endsWith(".vercel.app");
  const indexingAllowed = env.allowIndexing === "true";

  if (isProduction && isCustomDomain && !indexingAllowed) {
    return {
      ok: false,
      error:
        `Build blocked: production deploy to custom domain "${prodUrl}" but ` +
        `NEXT_PUBLIC_ALLOW_INDEXING is not "true". The site would ship noindex on the real ` +
        `domain and be invisible to search. Set NEXT_PUBLIC_ALLOW_INDEXING="true" ` +
        `(and NEXT_PUBLIC_SITE_URL) to launch, or you are deploying the wrong target.`,
    };
  }
  return { ok: true };
}

/** Reads the live env and throws when the guard fails. Called from next.config. */
export function assertIndexingConfigFromEnv(): void {
  const result = checkIndexingConfig({
    vercelEnv: process.env.VERCEL_ENV,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    allowIndexing: process.env.NEXT_PUBLIC_ALLOW_INDEXING,
  });
  if (!result.ok) throw new Error(result.error);
}
