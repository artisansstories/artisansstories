/**
 * platform-auth.ts — Platform-operator authorization for `/api/platform/**`
 *
 * P10 CUTOVER: the old POC posture ("a store-admin session whose tenant has
 * `isPlatformOwner = true`") is GONE. Operator power is no longer derived from
 * any store admin — it is a fully disjoint identity authenticated through the
 * `as-platform-session` cookie (see src/lib/platform-session.ts). This module is
 * now a thin compatibility shim so existing `/api/platform/**` imports keep
 * working while routing all authorization through `requirePlatformOperator`.
 *
 * Every `/api/platform/**` route MUST gate on `requirePlatformOperator`. It no
 * longer reads `isPlatformOwner` or the `as-admin-session` cookie. A store-admin
 * cookie confers ZERO platform access; an operator cookie confers ZERO store
 * access.
 */
export {
  requirePlatformOperator,
  platformAuthErrorResponse,
  PlatformAuthError,
  type PlatformOperatorIdentity,
} from "./platform-session";
