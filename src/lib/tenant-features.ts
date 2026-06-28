import { DEFAULT_TENANT_ID } from "@/lib/tenant-context";

/**
 * Features available only to the house/platform-owner tenant (Artisans Stories).
 * All other tenants get a focused store-only admin.
 */
export const HOUSE_ONLY_FEATURES = ["landing-page", "kb", "artisans"] as const;

/** Returns true when a tenantId is the house (platform-owner) tenant. */
export function isHouseTenant(tenantId: string | null | undefined): boolean {
  return tenantId === DEFAULT_TENANT_ID;
}
