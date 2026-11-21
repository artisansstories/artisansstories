-- add_store_notice.sql: storefront notice banner (Admin → Notice banner, MCP notice_* tools).
--
-- Additive and idempotent: one new table, nothing existing changes. Run it
-- once against every database BEFORE deploying the code that declares
-- StoreNotice in schema.prisma (only the banner and its admin page read it).
--
-- ROLLBACK (only after rolling the code back to a build without StoreNotice):
--   DROP TABLE IF EXISTS "StoreNotice";

CREATE TABLE IF NOT EXISTS "StoreNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkLabel" TEXT,
    "linkUrl" TEXT,
    "style" TEXT NOT NULL DEFAULT 'info',
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreNotice_tenantId_key" ON "StoreNotice"("tenantId");
