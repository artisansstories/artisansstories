import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { getAdminSession, clearAdminSession } from "@/lib/admin-auth";

/**
 * POST /api/platform/impersonate/stop — end an impersonation session (P10)
 *
 * Reachable while impersonating because the operator's `as-platform-session`
 * cookie was deliberately left intact at start. Requires a valid operator
 * (requirePlatformOperator), writes an "impersonate.stop" audit row, clears the
 * impersonated `as-admin-session` cookie, and returns the operator to
 * /platform/tenants.
 */
export async function POST(req: NextRequest) {
  let operator;
  try {
    operator = await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  // Read the impersonated admin session (if any) for the audit detail.
  const adminSession = await getAdminSession();
  const tenantId = adminSession?.tenantId ?? null;

  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "impersonate.stop",
      tenantId,
      detail: adminSession
        ? `stopped impersonating ${adminSession.email}`
        : "stopped impersonation (no active admin session)",
    },
  });

  // Drop the impersonated store-admin cookie; the operator keeps their platform
  // session and lands back on the tenants console.
  await clearAdminSession();

  return NextResponse.redirect(new URL("/platform/tenants", req.nextUrl.origin), { status: 303 });
}
