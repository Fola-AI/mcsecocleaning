import type { Instrumentation } from "next";

import { describeThrown, reportError } from "@/lib/monitoring";

/**
 * Server error reporting (§13.3, L14; Next 16 `instrumentation.ts` —
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`).
 *
 * Next calls this whenever the server captures an error, including ones React
 * has already swallowed into a digest during server-component rendering — which
 * is exactly the class of failure that otherwise shows a customer "something
 * went wrong" and leaves no trace anybody looks at.
 *
 * It writes one redacted line (see `src/lib/monitoring.ts`). When a Sentry DSN
 * exists, this is where the SDK call goes.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const { message, digest, stack } = describeThrown(error);
  reportError({
    message,
    digest,
    stack,
    path: request.path,
    source: context.routerKind === "App Router" ? `app:${context.routeType}` : "pages",
  });
};
