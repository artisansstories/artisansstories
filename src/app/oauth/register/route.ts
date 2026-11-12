import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { CORS_HEADERS, jsonCors, notFound } from "@/lib/mcp/oauth";
import { validateRedirectUris } from "@/lib/mcp/redirect-allowlist";
import { signClientId } from "@/lib/mcp/tokens";

/**
 * POST /oauth/register — RFC 7591 dynamic client registration.
 * Public clients only (token_endpoint_auth_method "none", PKCE required).
 * The client_id is a signed JWT carrying the validated redirect_uris, so no
 * registration table is needed. Any disallowed redirect URI rejects the WHOLE
 * registration.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!mcpGloballyEnabled()) return notFound();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, 400);
  }
  const redirectUris = body.redirect_uris;
  if (!validateRedirectUris(redirectUris)) {
    return jsonCors(
      {
        error: "invalid_redirect_uri",
        error_description: "Every redirect_uri must be https and on an allowed host",
      },
      400,
    );
  }
  const authMethod = body.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return jsonCors(
      { error: "invalid_client_metadata", error_description: "Only public clients (token_endpoint_auth_method=none) are supported" },
      400,
    );
  }
  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const clientId = await signClientId({ redirect_uris: redirectUris, client_name: clientName });
  return jsonCors(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export async function OPTIONS() {
  if (!mcpGloballyEnabled()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
