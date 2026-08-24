INSERT INTO "tenants" ("id", "name", "slug", "active", "basic_info", "created_at", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'Demo Hotel',
  'demo-hotel',
  true,
  '{"displayName":"Demo Hotel","address":"","contactEmail":"","phone":"","timezone":"","demo":true}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "basic_info" = COALESCE("tenants"."basic_info", '{}'::jsonb) || '{"displayName":"Demo Hotel","demo":true}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "tenant_modules" ("tenant_id", "module_id", "enabled", "updated_at")
SELECT "id", 'parking', true, CURRENT_TIMESTAMP
FROM "tenants"
WHERE "slug" = 'demo-hotel'
ON CONFLICT ("tenant_id", "module_id") DO UPDATE SET
  "enabled" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "tenant_modules" ("tenant_id", "module_id", "enabled", "updated_at")
SELECT "id", 'checkout', true, CURRENT_TIMESTAMP
FROM "tenants"
WHERE "slug" = 'demo-hotel'
ON CONFLICT ("tenant_id", "module_id") DO UPDATE SET
  "enabled" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "tenant_settings" (
  "tenant_id",
  "reservations",
  "frigate",
  "cameras",
  "stripe",
  "telegram",
  "notifications",
  "checkout",
  "integrations",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  '{"enabled":false,"source":null}'::jsonb,
  '{"enabled":true,"baseUrl":"http://frigate:5000","pollIntervalMs":5000,"cameras":[]}'::jsonb,
  '[]'::jsonb,
  '{"enabled":false}'::jsonb,
  '{}'::jsonb,
  '{"telegram":{"enabled":false}}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants"
WHERE "slug" = 'demo-hotel'
ON CONFLICT ("tenant_id") DO UPDATE SET
  "frigate" = CASE
    WHEN COALESCE("tenant_settings"."frigate"->>'baseUrl', '') = ''
      THEN "tenant_settings"."frigate" || '{"enabled":true,"baseUrl":"http://frigate:5000","pollIntervalMs":5000,"cameras":[]}'::jsonb
    ELSE "tenant_settings"."frigate"
  END,
  "updated_at" = CURRENT_TIMESTAMP;
