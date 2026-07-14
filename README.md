# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Qısa fikir

Bu repo Docker ilə qalxır.

- `web` konteyneri frontend-i göstərir
- `api` konteyneri backend-i işlədır
- `db` konteyneri PostgreSQL saxlayır

Lokal və server üçün əsas komanda:

```bash
docker compose up -d --build
```

## Lazım olanlar

- Docker
- Docker Compose plugin
- Git

## Lokal qurulum

1. Repo-ni çək.

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

2. Konteynerləri qaldır.

```bash
docker compose up -d --build
```

3. Brauzerdən aç.

```text
http://localhost:8080
```

4. API health check:

```bash
curl http://localhost:8080/api/health
```

## Build axını

Bu layihədə ayrıca `npm run dev` və `pm2` istifadə olunmur. Hər şey Docker ilə qalxır.

Görülən işlər:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

Dayandırmaq üçün:

```bash
docker compose down
```

## Ubuntu serverdə sıfırdan qurulum

1. Server paketlərini qur.

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
```

2. Docker qur.

```bash
curl -fsSL https://get.docker.com | sudo sh
```

3. Docker Compose plugin yoxla.

```bash
docker compose version
```

4. Layihəni serverə çək.

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

5. Konteynerləri build et və qaldır.

```bash
docker compose up -d --build
```

6. Health check et.

```bash
curl http://127.0.0.1:8080/api/health
```

## Domen yönləndirmə

Əgər domeni serverə bağlayacaqsansa:

- `glossgarage.az` DNS olaraq server IP-sinə gedir
- sonra Nginx və ya başqa reverse proxy `glossgarage.az` sorğusunu `127.0.0.1:8080`-ə yönləndirir

Bu repo-nun içindəki web konteyner artıq `api`-yə proxy edir.

## Backup

PostgreSQL data Docker volume-də qalır.

Məsələn backup üçün:

```bash
docker compose exec db pg_dump -U anar_user anar > anar.dump
```

Restore üçün:

```bash
cat anar.dump | docker compose exec -T db psql -U anar_user -d anar
```

## Qeyd

- `npm run dev` inkişaf rejimi üçün lazım deyil.
- `pm2` istifadə olunmur.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
