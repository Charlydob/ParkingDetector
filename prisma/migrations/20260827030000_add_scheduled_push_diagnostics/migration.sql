ALTER TABLE "scheduled_pushes"
  ADD COLUMN "http_status" INTEGER,
  ADD COLUMN "provider_reason" TEXT;
