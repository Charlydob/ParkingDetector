CREATE TABLE "web_push_configs" (
  "id" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "private_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "web_push_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_success_at" TIMESTAMP(3),
  "last_failure_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_preferences" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "new_checkout" BOOLEAN NOT NULL DEFAULT true,
  "assigned_to_me" BOOLEAN NOT NULL DEFAULT true,
  "room_completed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_pushes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "subscription_id" UUID,
  "endpoint" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "send_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),

  CONSTRAINT "scheduled_pushes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
CREATE INDEX "push_subscriptions_disabled_at_idx" ON "push_subscriptions"("disabled_at");
CREATE UNIQUE INDEX "push_preferences_user_id_tenant_id_key" ON "push_preferences"("user_id", "tenant_id");
CREATE INDEX "push_preferences_tenant_id_idx" ON "push_preferences"("tenant_id");
CREATE INDEX "scheduled_pushes_status_send_at_idx" ON "scheduled_pushes"("status", "send_at");
CREATE INDEX "scheduled_pushes_user_id_idx" ON "scheduled_pushes"("user_id");
CREATE INDEX "scheduled_pushes_tenant_id_idx" ON "scheduled_pushes"("tenant_id");

ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_preferences"
  ADD CONSTRAINT "push_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_preferences"
  ADD CONSTRAINT "push_preferences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_pushes"
  ADD CONSTRAINT "scheduled_pushes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_pushes"
  ADD CONSTRAINT "scheduled_pushes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_pushes"
  ADD CONSTRAINT "scheduled_pushes_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
