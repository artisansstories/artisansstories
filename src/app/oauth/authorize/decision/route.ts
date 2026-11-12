import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { originFromRequest } from "@/lib/tenant-host";
import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { notFound, redirectWithParams, validateAuthorizeParams } from "@/lib/mcp/oauth";
import { isTenantMcpEnabled } from "@/lib/mcp/tenant-flag";
import { clientHash, signAuthCode } from "@/lib/mcp/tokens";

/**
 * POST /oauth/authorize/decision — the consent form's submit target.
 * Requires the admin session cookie (SameSite=Lax, so it is not sent on a
 * cross-site POST) AND a same-origin Origin header. Issues a 5-minute
 * authorization code bound to client, redirect_uri, PKCE challenge, user,
 * tenant and the scope the user chose.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!mcpGloballyEnabled()) return notFound();

  const origin = request.headers.get("origin");
  if (!origin || origin !== originFromRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === "string") params.set(k, v);

  const v = await validateAuthorizeParams(params);
  if (!v.ok) {
    if (!v.redirectable) return new Response(v.error, { status: 400 });
    return redirectWithParams(v.redirectUri, { error: v.error, error_description: v.description, state: v.state });
  }
  const { redirectUri, state, clientId, codeChallenge } = v.value;

  if (params.get("decision") !== "allow") {
    return redirectWithParams(redirectUri, { error: "access_denied", state });
  }

  const session = await getAdminSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  // Live check — the session JWT can outlive a deactivation.
  const user = await prisma.adminUser.findUnique({
    where: { id: session.id },
    select: { id: true, tenantId: true, isActive: true },
  });
  if (!user || !user.isActive || (session.tenantId && session.tenantId !== user.tenantId)) {
    return redirectWithParams(redirectUri, { error: "access_denied", error_description: "Admin account is not active", state });
  }
  if (!(await isTenantMcpEnabled(user.tenantId))) {
    return redirectWithParams(redirectUri, {
      error: "access_denied",
      error_description: "AI assistant access is turned off for this store",
      state,
    });
  }

  // The human picks the scope on our page; a client-requested read-only scope
  // can't be upgraded.
  const chosen = params.get("access") === "read" || v.value.requestedScope === "mcp:read" ? "mcp:read" : "mcp:admin";

  const code = await signAuthCode({
    sub: user.id,
    tenantId: user.tenantId,
    scope: chosen,
    clientHash: clientHash(clientId),
    redirectUri,
    codeChallenge,
  });
  return redirectWithParams(redirectUri, { code, state });
}
