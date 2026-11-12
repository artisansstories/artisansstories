/**
 * admin-api.ts — auth helpers shared by every /api/admin/* route handler.
 *
 * Route handlers wrap their work in try/catch and map unexpected errors to 500.
 * A missing or unresolvable admin session must be a 401 instead, and must never
 * fall back to another tenant. Everything here throws TenantResolutionError
 * (status 401) for that case, and `authErrorResponse` turns it into the 401
 * response at the top of each catch block.
 */
import { NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "./admin-auth";
import { TenantResolutionError, resolveTenantFromAdminSession } from "./tenant-context";
import { isHouseTenant } from "./tenant-features";

/** Thrown for house-only admin areas (artisans, KB, Link Hub, email template, Instagram). Maps to 403. */
export class HouseOnlyError extends Error {
  readonly status = 403;
  constructor() {
    super("This feature is only available for the Artisans Stories store");
    this.name = "HouseOnlyError";
  }
}

/** The admin session, or a TenantResolutionError (401). Never redirects. */
export async function requireAdminApiSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new TenantResolutionError("No admin session");
  return session;
}

/** The session's tenant, or a TenantResolutionError (401). Never defaults to the house tenant. */
export async function requireAdminTenantId(): Promise<string> {
  const tenantId = await resolveTenantFromAdminSession();
  if (!tenantId) throw new TenantResolutionError("No admin session");
  return tenantId;
}

/**
 * The session's tenant if it is the house tenant. Same rule as the admin nav and
 * the MCP houseOnly registry: other stores get 403 from the API too.
 */
export async function requireHouseAdminTenantId(): Promise<string> {
  const tenantId = await requireAdminTenantId();
  if (!isHouseTenant(tenantId)) throw new HouseOnlyError();
  return tenantId;
}

/** 401/403 response for an auth failure, or null for any other error. */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof TenantResolutionError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof HouseOnlyError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}
