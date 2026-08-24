# Multi-Tenant Architecture

The app is self-hosted. Runtime state lives in PostgreSQL and tenant-scoped files live in Docker volumes.

## Request Model

- Browser calls the same origin.
- Frontend is served at `/`.
- Backend is reached at `/api/*`.
- Vite proxies `/api` to the local backend in development.
- Production Caddy routes `/api/*` to Node and everything else to the built frontend.

## Auth

- Users sign in with email/password.
- Passwords are hashed with Argon2id.
- Sessions are persisted in PostgreSQL.
- The browser receives an HttpOnly cookie.
- JavaScript never reads auth tokens.

## Authorization

- `platform_admin` is stored on `users.global_role`.
- `tenant_admin` and `staff` are stored in `memberships`.
- Backend routes validate tenant access and module entitlement.
- Tenant selection is derived from URL slugs and validated against session membership.
- `platform_admin` may select any tenant for support mode.

## Tenant Data

Core tables:

- `users`
- `sessions`
- `tenants`
- `memberships`
- `tenant_modules`
- `tenant_settings`
- `rooms`
- `key_identifiers`
- `checkout_events`
- `invitations`
- `detections`
- `check_ins`
- `plate_states`
- `diagnostics`

Tenant-scoped queries must filter by the backend-validated tenant id.

## Settings

Each tenant starts with empty integration settings. The app does not inherit Stripe, Frigate, Telegram, reservation, camera, URL, or credential values from another tenant.

Supported settings categories:

- reservations
- frigate
- cameras
- stripe
- telegram/notifications
- checkout
- future integrations

## Bootstrap

On first backend start, if no `platform_admin` exists, the backend creates one from:

```env
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
```

The bootstrap never overwrites an existing admin.
