-- add_mcp.sql: database changes for the MCP server (AI assistant access).
--
-- STATUS: NOT APPLIED. An operator runs this by hand against every database
-- (production Neon included) BEFORE deploying feat/mcp-server. schema.prisma
-- now declares StoreSettings.mcpEnabled, so every generated storeSettings query
-- selects that column, and a deploy before this runs will break the store.
--
-- Idempotent: safe to run more than once. Names and types match what
-- `prisma migrate diff` generates for these models.
--
-- ROLLBACK (only after rolling the code back to a build without these fields):
--   DROP TABLE IF EXISTS "McpNonce";
--   ALTER TABLE "StoreSettings" DROP COLUMN IF EXISTS "mcpEnabled";

-- Per-store on/off switch for AI assistant (MCP) access. Default off.
ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "mcpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Single-use markers for confirm tokens and OAuth authorization codes.
-- "id" is the sha256 (hex) of the token or code.
CREATE TABLE IF NOT EXISTS "McpNonce" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpNonce_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "McpNonce_expiresAt_idx" ON "McpNonce"("expiresAt");
