# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Layihə quruluşu

- Frontend: Vite, `http://localhost:5173`
- Backend: Node.js, `http://localhost:3001`
- Database: PostgreSQL

`vite.config.js` API sorğularını `127.0.0.1:3001`-ə proxy edir.

## Lokal istifadə

Bu layihəni lokalda 2 formada işlədə bilərsən.

### Variant 1: tək komanda

Bu komanda backend və frontend-i birlikdə qaldırır:

```bash
npm run dev
```

Sonra bunlar açıq olur:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Variant 2: ayrı-ayrı işlətmək

1. Asılılıqları qur.

```bash
npm install
```

2. `.env` faylını hazırla.

```bash
cp .env.example .env
```

3. Bir terminalda backend-i aç.

```bash
npm run server
```

4. Başqa terminalda frontend-i aç.

```bash
npm run client
```

## Yoxlama

Backend health:

```bash
curl http://localhost:3001/api/health
```

Frontend:

```text
http://localhost:5173
```

## Build

Production build:

```bash
npm run build
```

## Docker ilə işlətmək

Bu repo üçün Docker production axını da var.

```bash
docker compose up -d --build
```

Docker-da:

- public web giriş: `http://localhost:8080`
- API: konteyner içində `3001`
- PostgreSQL: `db` servisində

Yoxlama:

```bash
curl http://localhost:8080/api/health
```

## Ubuntu serverdə qaldırmaq

Əgər serverdə Docker istifadə edəcəksənsə, `INSTALLATION.md`-ə bax:

```bash
cat INSTALLATION.md
```

Qısa fikir:

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
docker compose up -d --build
```

## Backup

PostgreSQL backup:

```bash
docker compose exec db pg_dump -U anar_user anar > anar.dump
```

Restore:

```bash
cat anar.dump | docker compose exec -T db psql -U anar_user -d anar
```

## Qeyd

- `npm run dev` development üçün ən rahat yoldur.
- `npm run client` frontend-i, `npm run server` backend-i ayrıca açır.
- `pm2` istifadə olunmur.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
