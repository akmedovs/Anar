# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js layihəsi.

## Layihə nədir

Bu repo avtomatik hesabatlar, aftoyuma üçün maşın girişləri və kameradan tanıma axını üçün hazırlanıb.

## Texnologiyalar

- Frontend: React + Vite
- Backend: Node.js HTTP server
- Database: PostgreSQL
- Opsional: vehicle recognition üçün Python skripti

## Lokal işlətmə

Layihə lokalda belə açılır:

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
npm install
npm run dev
```

Default portlar:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

Health check:

```bash
curl http://localhost:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## Ayrı-ayrı işə salmaq

Əgər frontend və backend-i ayrı açmaq istəyirsənsə:

```bash
npm install
```

Backend:

```bash
npm run server
```

Frontend:

```bash
npm run client
```

## Build

Production build:

```bash
npm run build
```

## Environment

`.env.example` faylından başla:

```bash
cp .env.example .env
```

Əsas dəyişənlər:

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - backend portu, default `3001`
- `VEHICLE_VISION_COMMAND` - python icraçı yolu, default `python3`
- `VEHICLE_YOLO_MODEL` - vehicle detector model yolu
- `VEHICLE_YOLO_CONF` - detector confidence, default `0.25`
- `VEHICLE_OCR_CONFIG` - Tesseract OCR config

## Production

Production üçün tipik sıra:

```bash
npm install
npm run build
npm run server
```

Production-da tövsiyə olunan model:

- `server/server.js` prosesi ayrıca servisdə işləsin
- `dist/` qovluğunu Nginx servis etsin
- `/api/*` sorğuları `127.0.0.1:3001`-ə proxy olunsun
- Backup üçün `pg_dump` istifadə olunsun

## Qeydlər

- Backend artıq PostgreSQL istifadə edir.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
- Recognition feature istifadə etmirsənsə, Python/OCR paketləri lazım deyil.
