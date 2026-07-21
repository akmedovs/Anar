# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Nə var

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Database: PostgreSQL
- Opsional: vehicle recognition üçün ayrı `FastAPI` vision servisi və onun Docker image-i daxilindəki paketləri


## Installation - sıfır Ubuntu serverdə qurulum

Bu bölmə yeni Ubuntu serverdə layihəni tam Docker ilə ayağa qaldırmaq üçündür. Komandaları ardıcıl yaz.

### 0. Serverə daxil ol

Öz kompüterindən serverə SSH ilə gir:

```bash
ssh USERNAME@SERVER_IP
```

Məsələn:

```bash
ssh anar@192.168.25.150
```

### 1. Sistemi hazırla və Docker quraşdır

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

İstifadəçini Docker qrupuna əlavə et:

```bash
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

### 2. Firewall portlarını aç

```bash
sudo ufw allow OpenSSH
sudo ufw allow 5173/tcp
sudo ufw allow 3001/tcp
sudo ufw --force enable
sudo ufw status
```

Sayt üçün əsas port `5173`-dür. Backend API üçün `3001` açıq saxlanılır.

### 3. Layihəni GitHub-dan serverə çək

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

Əgər repo artıq serverdə varsa:

```bash
cd ~/Anar
git pull origin main
```

### 4. Environment faylını hazırla

```bash
cp .env.example .env
nano .env
```

Əsas production dəyərlərini dəyiş:

```env
AUTH_ADMIN_USERNAME=akmedovs
AUTH_ADMIN_PASSWORD=BURADA_GUCLU_PAROL_YAZ
AUTH_ADMIN_EMAIL=senin-email@example.com
AUTH_JWT_SECRET=UZUN_RANDOM_SECRET_YAZ
APP_PUBLIC_URL=http://SERVER_IP:5173
```

Şifrə reset emaili üçün SMTP ayarlarını sistemə admin kimi daxil olduqdan sonra `AdminPanel -> Reset email ayarları` bölməsindən yaz.
SMTP boş olsa sistem işləyəcək, amma reset link emailə getməyəcək; link backend logunda görünəcək.

### 5. Proyekti build edib işə sal

```bash
docker compose up -d --build
```

İlk build bir az vaxt apara bilər, çünki OCR/YOLO paketləri və modellər image-ə əlavə olunur.

### 6. Statusu yoxla

```bash
docker compose ps
curl http://localhost:3001/api/health
```

Uğurlu cavab belə olmalıdır:

```json
{"ok":true,"database":"postgresql"}
```

Sayt: `http://SERVER_IP:5173`

Məsələn:

```text
http://192.168.25.150:5173
```

Login səhifəsində project üçün təyin edilmiş istifadəçi adı və parol ilə daxil ol.

### Docker artıq qurulubsa qısa qurulum

Əgər Ubuntu serverdə Docker artıq hazırdırsa, sadəcə bunları yaz:

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
curl http://localhost:3001/api/health
```

Brauzerdə aç:

```text
http://SERVER_IP:5173
```

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
- `AUTH_ADMIN_USERNAME` - ilk admin istifadəçi adı
- `AUTH_ADMIN_PASSWORD` - ilk admin şifrəsi
- `AUTH_ADMIN_EMAIL` - admin emaili; password reset üçün lazımdır
- `AUTH_JWT_SECRET` - login token imzası üçün uzun random secret
- `APP_PUBLIC_URL` - ilk default reset link ünvanı; sonra AdminPanel-dən dəyişmək olar
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` - opsional fallback SMTP ayarları; əsas idarəetmə AdminPanel-dədir

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
