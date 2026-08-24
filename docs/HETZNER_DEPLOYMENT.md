# Hetzner Deployment

This deployment is fully self-hosted on one Hetzner server. GitHub is only the code repository.

Production URLs:

- App: `https://hotelapp.charlydob.com`
- API: `https://hotelapp.charlydob.com/api/*`

## 1. Prepare Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

## 2. DNS

Create an `A` record:

```text
hotelapp.charlydob.com -> YOUR_HETZNER_IPV4
```

Add an `AAAA` record too if the server has IPv6. Wait until:

```bash
dig +short hotelapp.charlydob.com
```

returns the server IP.

## 3. Clone And Configure

```bash
git clone https://github.com/YOUR_ORG/ParkingDetector.git HotelApp
cd HotelApp
cp .env.example .env
nano .env
```

Required changes:

```env
APP_DOMAIN=hotelapp.charlydob.com
APP_ORIGIN=https://hotelapp.charlydob.com
POSTGRES_PASSWORD=replace-with-a-long-secret
DATABASE_URL=postgresql://hotelapp:replace-with-a-long-secret@postgres:5432/hotelapp?schema=public
SESSION_SECRET=replace-with-a-long-random-secret
BOOTSTRAP_ADMIN_EMAIL=owner@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-long-initial-password
```

Do not commit `.env`.

## 4. Start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Caddy obtains TLS automatically. Check:

```bash
curl -I https://hotelapp.charlydob.com
curl https://hotelapp.charlydob.com/api/health
```

## 5. First Admin

On first backend start, if no `platform_admin` exists, the backend creates one from:

```env
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
```

After the first successful start, the role and password hash live in PostgreSQL. Later restarts do not overwrite the user.

Login at:

```text
https://hotelapp.charlydob.com/login
```

## 6. Tenants And Users

As `platform_admin`:

1. Open `/admin`.
2. Create a tenant with name and slug.
3. Enable modules such as `parking` and `checkout`.
4. Configure integrations for that tenant.
5. Invite users as `tenant_admin` or `staff`.

Invitation flow:

```text
admin creates invite -> /accept-invite/:token -> user sets password -> backend creates membership -> invitation is marked used
```

There is no public signup.

## 7. External Frigate

Frigate is optional per tenant. Do not assume localhost.

For a tenant, set:

- enabled
- base URL reachable from the HotelApp backend
- credentials if the external proxy requires them
- camera names

Examples:

```text
https://frigate.your-hetzner-domain.example
http://192.168.1.50:5000
```

If Frigate is on a hotel NAS, expose it through a secure VPN, private network, or authenticated HTTPS reverse proxy.

## 8. Update App

```bash
cd HotelApp
git pull
docker compose up -d --build
docker compose ps
```

Database migrations run on backend startup with `prisma migrate deploy`.

## 9. Backup

Create a backup directory:

```bash
mkdir -p backups/$(date +%F)
```

PostgreSQL dump:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/$(date +%F)/hotelapp.sql
```

Volumes:

```bash
docker run --rm -v hotelapp_postgres-data:/volume -v "$PWD/backups/$(date +%F)":/backup alpine tar czf /backup/postgres-data.tgz -C /volume .
docker run --rm -v hotelapp_app-data:/volume -v "$PWD/backups/$(date +%F)":/backup alpine tar czf /backup/app-data.tgz -C /volume .
docker run --rm -v hotelapp_app-evidence:/volume -v "$PWD/backups/$(date +%F)":/backup alpine tar czf /backup/app-evidence.tgz -C /volume .
cp .env backups/$(date +%F)/env
```

Store backups off-server. Keep `.env` and secrets out of GitHub.

## 10. Restore To New Hetzner

On the new server, install Docker, clone the repo, copy `.env`, and copy backup files into the repo directory.

Start Postgres only:

```bash
docker compose up -d postgres
```

Restore SQL dump:

```bash
cat backups/YYYY-MM-DD/hotelapp.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

Restore file volumes if needed:

```bash
docker run --rm -v hotelapp_app-data:/volume -v "$PWD/backups/YYYY-MM-DD":/backup alpine sh -c "cd /volume && tar xzf /backup/app-data.tgz"
docker run --rm -v hotelapp_app-evidence:/volume -v "$PWD/backups/YYYY-MM-DD":/backup alpine sh -c "cd /volume && tar xzf /backup/app-evidence.tgz"
```

Start everything:

```bash
docker compose up -d --build
```

Point DNS to the new server IP and verify:

```bash
curl https://hotelapp.charlydob.com/api/health
```
