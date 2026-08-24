CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "occupancy_cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_reason" TEXT NOT NULL DEFAULT 'ready',
    "consumed_at" TIMESTAMP(3),
    "reservation_code" TEXT,
    "guest_name" TEXT,
    "guest_email" TEXT,
    "departure_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "occupancy_cycles_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "checkout_events" ADD COLUMN "occupancy_cycle_id" UUID;

-- Seed a current cycle for rooms that are already ready or occupied at migration time.
INSERT INTO "occupancy_cycles" (
  "id",
  "tenant_id",
  "room_id",
  "cycle_number",
  "opened_at",
  "created_reason",
  "metadata"
)
SELECT
  gen_random_uuid(),
  "tenant_id",
  "id",
  1,
  CURRENT_TIMESTAMP,
  'migration',
  '{}'::jsonb
FROM "rooms"
WHERE "status" IN ('ready', 'occupied');

-- CreateIndex
CREATE UNIQUE INDEX "checkout_events_occupancy_cycle_id_key" ON "checkout_events"("occupancy_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_cycles_tenant_id_room_id_cycle_number_key" ON "occupancy_cycles"("tenant_id", "room_id", "cycle_number");

-- CreateIndex
CREATE INDEX "occupancy_cycles_tenant_id_room_id_consumed_at_idx" ON "occupancy_cycles"("tenant_id", "room_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_cycles_current_room_key" ON "occupancy_cycles"("tenant_id", "room_id") WHERE "consumed_at" IS NULL;

-- AddForeignKey
ALTER TABLE "occupancy_cycles" ADD CONSTRAINT "occupancy_cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_cycles" ADD CONSTRAINT "occupancy_cycles_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_events" ADD CONSTRAINT "checkout_events_occupancy_cycle_id_fkey" FOREIGN KEY ("occupancy_cycle_id") REFERENCES "occupancy_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
