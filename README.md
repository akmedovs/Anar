# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Nə var

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Database: PostgreSQL
- Opsional: vehicle recognition üçün ayrı `FastAPI` vision servisi və onun Docker image-i daxilindəki paketləri


## Installation - Ubuntu serverdə 5 addım

Aşağıdakı komandalar təmiz Ubuntu serverdə layihəni Docker ilə ayağa qaldırmaq üçündür.

### 1. Sistem paketlərini yenilə və Docker quraşdır

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2. Layihəni serverə çək

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

### 3. Environment faylını hazırla

```bash
cp .env.example .env
```

Lazımdırsa `.env` içində database və OCR dəyişənlərini dəyiş. Docker Compose default ayarlarla da işləyir.

### 4. Proyekti build edib işə sal

```bash
docker compose up -d --build
```

### 5. Statusu yoxla

```bash
docker compose ps
curl http://localhost:3001/api/health
```

Uğurlu cavab belə olmalıdır:

```json
{"ok":true,"database":"postgresql"}
```

Sayt: `http://SERVER_IP:5173`

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
- `VEHICLE_VISION_COMMAND` - legacy CLI fallback üçün default `python3`
- `VEHICLE_VISION_URL` - vision servisi, default `http://vision:8000`
- `VEHICLE_VISION_TIMEOUT_MS` / `VEHICLE_VISION_HTTP_TIMEOUT_MS`
- `VEHICLE_OCR_BACKENDS` - OCR sırası, məsələn `easyocr,paddle,tesseract`
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
- `vision` konteyneri plate recognition pipeline-i `8000`-də açır.
- `db` konteyneri PostgreSQL saxlayır.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
