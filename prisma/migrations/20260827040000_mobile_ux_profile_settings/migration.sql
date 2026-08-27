ALTER TABLE "users"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "username_normalized" TEXT;

CREATE UNIQUE INDEX "users_username_normalized_key"
  ON "users" ("username_normalized")
  WHERE "username_normalized" IS NOT NULL;

ALTER TABLE "memberships"
  ADD COLUMN "alias" TEXT;

ALTER TABLE "tenant_settings"
  ADD COLUMN "dashboard" JSONB NOT NULL DEFAULT '{}';
