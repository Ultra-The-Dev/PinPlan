// Next.js instrumentation (runs on the server only).
// - register(): once per server instance — one loud log line naming any required production settings that are missing
//   (names only; values are never logged). /api/health also answers 503 until they are set.
// - onRequestError(): errors Next.js catches in route handlers, server rendering, server actions and the proxy are
//   written (scrubbed) to app_errors with platform 'server', so they show up in /admin next to app reports.
import type { Instrumentation } from "next";
import { configWarning } from "@/lib/server/envCheck";
import { reportServerError } from "@/lib/server/serverErrors";

export function register() {
  const warning = configWarning();
  if (warning) console.error(warning);
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportServerError(error, {
    where: context.routePath || "server",
    path: request.path,
    method: request.method,
    extra: { routeType: context.routeType, routerKind: context.routerKind, ...(context.renderSource ? { renderSource: context.renderSource } : {}) },
  });
};
