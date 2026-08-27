ALTER TABLE "users"
  ADD COLUMN "telegram_user_id" TEXT,
  ADD COLUMN "telegram_username" TEXT,
  ADD COLUMN "telegram_linked_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id");
