-- add_mcp_enabled.sql — per-store switch for AI assistant (MCP) access.
--
-- STATUS: NOT APPLIED. Written on branch feat/mcp-server; apply manually to each
-- database before merging. Until it runs, the AI Assistants toggle is disabled
-- and MCP stays OFF for every store (src/lib/mcp/tenant-flag.ts fails closed).
--
-- After applying everywhere, add to model StoreSettings in schema.prisma:
--   mcpEnabled Boolean @default(false)
-- (and switch tenant-flag.ts to the typed client). Do NOT run `prisma db push`
-- before that schema line exists, or Prisma will try to drop this column.

ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "mcpEnabled" BOOLEAN NOT NULL DEFAULT false;
