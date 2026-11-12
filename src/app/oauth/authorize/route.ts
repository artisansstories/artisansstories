import type { NextRequest } from "next/server";
import { originFromRequest } from "@/lib/tenant-host";
import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { CORS_HEADERS, notFound, redirectWithParams, validateAuthorizeParams } from "@/lib/mcp/oauth";

/**
 * GET /oauth/authorize — validates the request, then hands off to the consent
 * page under /admin. Living under /admin means the existing proxy sends anyone
 * without an admin session through magic-link login and back (callbackUrl).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorPage(message: string): Response {
  const safe = message.replace(/[<>&"]/g, "");
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title><body style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:80px auto;color:#3a2e24"><h1 style="font-size:22px">Can't connect this app</h1><p>${safe}</p></body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: NextRequest) {
  if (!mcpGloballyEnabled()) return notFound();
  const params = request.nextUrl.searchParams;
  const v = await validateAuthorizeParams(params);
  if (!v.ok) {
    if (!v.redirectable) return errorPage(v.error);
    return redirectWithParams(v.redirectUri, { error: v.error, error_description: v.description, state: v.state });
  }
  const consent = new URL("/admin/oauth/consent", originFromRequest(request));
  params.forEach((value, key) => consent.searchParams.set(key, value));
  return Response.redirect(consent.toString(), 302);
}

/** CORS preflight. Browsers normally navigate here, but some clients probe it first. */
export async function OPTIONS() {
  if (!mcpGloballyEnabled()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
