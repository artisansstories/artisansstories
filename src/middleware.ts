/**
 * src/middleware.ts — Next.js middleware entry point.
 *
 * Delegates entirely to src/proxy.ts which owns all routing logic:
 * subdomain → /t/{slug} rewrites, admin/platform JWT guards, store-enabled
 * gating, etc. Keeping this thin lets us unit-test proxy.ts independently.
 */
export { proxy as middleware, config } from "./proxy";
