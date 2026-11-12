/**
 * Pieces of @/lib/tenant-context that do not touch the database, for use inside
 * vi.mock("@/lib/tenant-context", ...) factories. Route catch blocks call
 * authErrorResponse (src/lib/admin-api.ts), which does
 * `err instanceof TenantResolutionError`, and isHouseTenant compares against
 * DEFAULT_TENANT_ID, so every mock of the module must export both.
 *
 *   vi.mock("@/lib/tenant-context", async () => ({
 *     ...(await import("../helpers/tenant-context-mock")).tenantContextBase,
 *     getTenantPrismaForAdmin: ...,
 *   }));
 */
export const DEFAULT_TENANT_ID = "tenant_artisans_stories";

export class TenantResolutionError extends Error {
  readonly status = 401;
  constructor(message = "Unable to resolve tenant for request") {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export const tenantContextBase = { DEFAULT_TENANT_ID, TenantResolutionError };
