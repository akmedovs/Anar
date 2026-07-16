# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Nə var

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Database: PostgreSQL
- Opsional: vehicle recognition üçün Python skripti və onun Docker image-i daxilindəki paketləri

## Docker ilə işə salma

Ən sadə işə salma:

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
docker compose up -d --build
```

Sonra:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

## Lokalda yoxlama

```bash
curl http://localhost:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## Docker komandaları

Konteynerlərə bax:

```bash
docker compose ps
```

Loglara bax:

```bash
docker compose logs -f
```

Dayandır:

```bash
docker compose down
```

Tam sıfırlama:

```bash
docker compose down -v
```

## Environment

`.env.example`-dən başla:

```bash
cp .env.example .env
```

Əsas dəyişənlər:

- `DATABASE_URL`
- `PORT` - backend portu, default `3001`
- `VEHICLE_VISION_COMMAND` - default `python3`
- `VEHICLE_OCR_BACKENDS` - OCR sırası, məsələn `paddle,tesseract`
- `VEHICLE_PADDLE_TIMEOUT_MS` - Paddle worker timeout, default `45000`
- `VEHICLE_OCR_LANG` - OCR dili, default `en`
- `VEHICLE_YOLO_MODEL` - plate detector modeli; boşdursa sistem manual review rejimində qalır
- `VEHICLE_YOLO_CONF`

## Yedəkləmə

Backup:

```bash
docker compose exec db pg_dump -U anar_user anar > anar.dump
```

Restore:

```bash
cat anar.dump | docker compose exec -T db psql -U anar_user -d anar
```

## Qeydlər

- `web` konteyneri frontend-i `5173`-də açır.
- `api` konteyneri backend-i `3001`-də açır.
- `db` konteyneri PostgreSQL saxlayır.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
