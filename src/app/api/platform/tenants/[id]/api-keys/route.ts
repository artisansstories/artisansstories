import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { generateApiKey } from "@/lib/api-key";
import { DEFAULT_SCOPES, unknownScopes } from "@/lib/platform-tenants";

/**
 * /api/platform/tenants/[id]/api-keys — mint & list scoped API keys (P6)
 *
 *   POST → mint a key. The RAW token is returned exactly ONCE; only its sha256
 *          hash + prefix + scopes are persisted. Body:
 *            { name, scopes?: string[], env?: "live" | "test" }
 *   GET  → list keys (metadata only — NEVER the raw token or hash).
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
 */

interface MintBody {
  name?: unknown;
  scopes?: unknown;
  env?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: MintBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "validation_failed", errors: ["`name` is required."] },
      { status: 400 },
    );
  }

  // Resolve scopes (default when omitted) and validate against the allowlist.
  let scopes: string[];
  if (body.scopes === undefined) {
    scopes = [...DEFAULT_SCOPES];
  } else if (
    Array.isArray(body.scopes) &&
    body.scopes.every((s) => typeof s === "string")
  ) {
    scopes = body.scopes as string[];
  } else {
    return NextResponse.json(
      { error: "validation_failed", errors: ["`scopes` must be an array of strings."] },
      { status: 400 },
    );
  }
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: "validation_failed", errors: ["`scopes` must contain at least one scope."] },
      { status: 400 },
    );
  }
  const bad = unknownScopes(scopes);
  if (bad.length) {
    return NextResponse.json(
      { error: "invalid_scopes", message: `Unknown scope(s): ${bad.join(", ")}` },
      { status: 400 },
    );
  }
  // De-duplicate while preserving order.
  scopes = [...new Set(scopes)];

  const env = body.env === "test" ? "test" : body.env === "live" ? "live" : "live";
  const generated = generateApiKey(env);

  const created = await prisma.tenantApiKey.create({
    data: {
      tenantId,
      name,
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      scopes,
    },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      token: generated.raw,
      prefix: created.prefix,
      scopes: created.scopes,
      createdAt: created.createdAt,
      warning: "store this now; it will not be shown again",
    },
    { status: 201 },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    // Deliberately NEVER select keyHash — only safe-to-display metadata.
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ keys });
}
