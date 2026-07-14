# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js layihəsi.

## Cari quruluş

- Frontend: React + Vite
- Backend: Node.js HTTP server
- Storage: local JSON faylı (`server/db.json`)
- Opsional: vehicle recognition üçün Python skripti

## Lazım olanlar

- Node.js 20 və ya daha yeni
- npm
- Git
- Opsional recognition üçün:
  - Python 3
  - `pip`
  - `tesseract-ocr`
  - `opencv-python`
  - `ultralytics`
  - `pytesseract`

## Lokal işə salma

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
{"ok":true,"database":"json"}
```

## Production

Bu repo hazırkı vəziyyətdə birbaşa Node server + static build modeli ilə işləyir.

```bash
npm install
npm run build
```

Frontend build `dist/` qovluğuna yazılır. Backend üçün:

```bash
npm run server
```

Production-da ən sadə model:

- `server/server.js` prosesi PM2 ilə işləsin
- `dist/` qovluğunu Nginx servis etsin
- `/api/*` sorğuları `127.0.0.1:3001`-ə proxy olunsun

Ubuntu üçün tam ardıcıllıq `INSTALLATION.md` faylında verilib.

## Environment

`.env.example` faylından başlayın:

```bash
cp .env.example .env
```

Əsas dəyişənlər:

- `PORT` - backend portu, default `3001`
- `VEHICLE_VISION_COMMAND` - python icraçı yolu, default `python3`
- `VEHICLE_YOLO_MODEL` - vehicle detector model yolu
- `VEHICLE_YOLO_CONF` - detector confidence, default `0.25`
- `VEHICLE_OCR_CONFIG` - Tesseract OCR config

## Qeydlər

- Backend hazırda PostgreSQL yox, local JSON storage istifadə edir.
- `server/db.json` Git-ə əlavə olunmamalıdır.
- Recognition feature istifadə etmirsinizsə, Python/OCR paketləri tələb olunmur.
