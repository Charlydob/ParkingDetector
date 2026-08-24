ALTER TABLE "rooms" ADD COLUMN "deleted_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "rooms_tenant_id_number_key";

CREATE UNIQUE INDEX "rooms_tenant_id_number_active_key"
  ON "rooms"("tenant_id", "number")
  WHERE "deleted_at" IS NULL;

CREATE INDEX "rooms_tenant_id_number_idx" ON "rooms"("tenant_id", "number");
