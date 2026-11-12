-- add_store_tax_settings.sql: give tax settings their own column.
--
-- STATUS: NOT APPLIED. An operator runs this by hand against every database
-- (production Neon included) BEFORE deploying fix/admin-mcp-full-verify.
-- schema.prisma now declares StoreSettings.taxSettings, so every generated
-- storeSettings query selects that column, and a deploy before this runs will
-- break the store.
--
-- Background: /api/admin/tax used to save tax settings as the string
-- 'TAX:{json}' in StoreSettings."facebookPixelId", which wiped any real Pixel ID,
-- and it always wrote the row with id 'singleton' (the house store), so it
-- failed for every other store.
--
-- Idempotent: safe to run more than once. The column type matches what
-- `prisma migrate diff` generates for `taxSettings Json?`.
--
-- ROLLBACK (only after rolling the code back to a build without the field):
--   UPDATE "StoreSettings" SET "facebookPixelId" = 'TAX:' || "taxSettings"::text
--     WHERE "taxSettings" IS NOT NULL AND "facebookPixelId" IS NULL;
--   ALTER TABLE "StoreSettings" DROP COLUMN IF EXISTS "taxSettings";

ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "taxSettings" JSONB;

-- Move tax data out of "facebookPixelId". Only values that start with 'TAX:'
-- AND parse as a JSON object are moved; a real Pixel ID (digits) never starts
-- with 'TAX:', so it is never touched. A row whose 'TAX:' value is not valid
-- JSON is left as it is and reported with a NOTICE for manual review.
DO $$
DECLARE
  r RECORD;
  parsed JSONB;
BEGIN
  FOR r IN
    SELECT "id", "facebookPixelId" FROM "StoreSettings"
    WHERE "facebookPixelId" LIKE 'TAX:%'
  LOOP
    BEGIN
      parsed := substring(r."facebookPixelId" FROM 5)::jsonb;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'StoreSettings % has a TAX: value that is not JSON; left unchanged', r."id";
      CONTINUE;
    END;
    IF jsonb_typeof(parsed) <> 'object' THEN
      RAISE NOTICE 'StoreSettings % has a TAX: value that is not a JSON object; left unchanged', r."id";
      CONTINUE;
    END IF;
    UPDATE "StoreSettings"
      SET "taxSettings" = COALESCE("taxSettings", parsed),
          "facebookPixelId" = NULL
      WHERE "id" = r."id";
  END LOOP;
END $$;
