ALTER TABLE "rooms"
  ADD COLUMN "checkout_due_date" DATE,
  ADD COLUMN "checkout_due_source" TEXT,
  ADD COLUMN "last_cleaned_at" TIMESTAMP(3);

ALTER TABLE "checkout_events"
  ADD COLUMN "telegram_message_id" TEXT,
  ADD COLUMN "telegram_chat_id" TEXT,
  ADD COLUMN "telegram_message_deleted_at" TIMESTAMP(3);

CREATE INDEX "rooms_tenant_id_checkout_due_date_idx"
  ON "rooms"("tenant_id", "checkout_due_date");
