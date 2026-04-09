-- Add Linktree functionality to Artisans Stories
-- Allows admin to manage a single-page link collection

CREATE TABLE "LinkTreeSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "profileName" TEXT NOT NULL DEFAULT 'Artisans Stories',
  "profileBio" TEXT,
  "profileImageUrl" TEXT,
  "customSlug" TEXT,
  "backgroundColor" TEXT DEFAULT '#FFFBF0',
  "buttonColor" TEXT DEFAULT '#8B6914',
  "textColor" TEXT DEFAULT '#1F2937',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LinkTreeSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LinkTreeLink" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LinkTreeLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LinkTreeLink_sortOrder_idx" ON "LinkTreeLink"("sortOrder");
CREATE INDEX "LinkTreeLink_isEnabled_idx" ON "LinkTreeLink"("isEnabled");
