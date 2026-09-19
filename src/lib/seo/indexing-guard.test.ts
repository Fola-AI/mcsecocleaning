import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIndexingConfig } from "@/lib/seo/indexing-guard";

/**
 * The guard must fail the build ONLY when a production deploy to a real custom
 * domain would ship noindex. The *.vercel.app test deploy and all non-production
 * environments must keep building.
 */

test("BLOCKS: production custom domain with indexing off", () => {
  const r = checkIndexingConfig({
    vercelEnv: "production",
    productionUrl: "www.mcsecocleaning.co.uk",
    allowIndexing: undefined,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /noindex/i);
});

test("BLOCKS: production custom domain with indexing explicitly not true", () => {
  const r = checkIndexingConfig({
    vercelEnv: "production",
    productionUrl: "mcsecocleaning.co.uk",
    allowIndexing: "false",
  });
  assert.equal(r.ok, false);
});

test("ALLOWS: production custom domain with indexing on (real launch)", () => {
  const r = checkIndexingConfig({
    vercelEnv: "production",
    productionUrl: "www.mcsecocleaning.co.uk",
    allowIndexing: "true",
  });
  assert.equal(r.ok, true);
});

test("ALLOWS: the *.vercel.app production alias stays noindex and still builds", () => {
  const r = checkIndexingConfig({
    vercelEnv: "production",
    productionUrl: "mcsecocleaning.vercel.app",
    allowIndexing: undefined,
  });
  assert.equal(r.ok, true);
});

test("ALLOWS: preview deploys never block", () => {
  const r = checkIndexingConfig({
    vercelEnv: "preview",
    productionUrl: "www.mcsecocleaning.co.uk",
    allowIndexing: undefined,
  });
  assert.equal(r.ok, true);
});

test("ALLOWS: local build (no Vercel env) never blocks", () => {
  const r = checkIndexingConfig({});
  assert.equal(r.ok, true);
});
