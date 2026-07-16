# Ubuntu Server Installation

Bu sənəd `Anar` layihəsini Ubuntu serverdə Docker ilə qaldırmaq üçündür.

## 1. Server hazırlığı

### Minimum

- 1 vCPU
- 2 GB RAM
- 20 GB SSD

### Tövsiyə olunan

- 2 vCPU
- 4 GB RAM
- 40 GB SSD

## 2. Lazım olan paketlər

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
```

## 3. Docker qur

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Docker Compose yoxla:

```bash
docker compose version
```

İstifadəçini docker qrupuna əlavə et:

```bash
sudo usermod -aG docker $USER
```

Sonra sessiyanı yenilə.

## 4. Layihəni serverə çək

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

## 5. Konteynerləri qaldır

```bash
docker compose up -d --build
```

Bu versiyada avtomatik oxuma üçün `YOLO` detector + OCR + strict regex + manual confirm flow istifadə olunur.
`VEHICLE_OCR_BACKENDS=paddle,tesseract` olduqda server əvvəlcə Paddle worker-i sınayır, alınmasa Tesseract fallback işləyir.
`VEHICLE_PADDLE_TIMEOUT_MS` ilə Paddle worker timeout-unı tənzimləyə bilərsiniz.
`VEHICLE_YOLO_MODEL` boşdursa, sistem plate-i auto-saxlamır və manual review təklif edir.

## 6. Yoxlama

Frontend:

```bash
curl http://127.0.0.1:5173
```

Backend health:

```bash
curl http://127.0.0.1:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## 7. Dayandırmaq

```bash
docker compose down
```

## 8. Tam sıfırlama

Əgər volume-ları da silmək istəyirsənsə:

```bash
docker compose down -v
```

## 9. Backup

PostgreSQL backup:

```bash
docker compose exec db pg_dump -U anar_user anar > anar.dump
```

Restore:

```bash
cat anar.dump | docker compose exec -T db psql -U anar_user -d anar
```

## 10. Domen bağlamaq

Əgər domen bağlayacaqsansa:

- `glossgarage.az` və ya `anar.yourdomain.com` DNS olaraq server IP-sinə gedir
- sonra reverse proxy sorğunu `127.0.0.1:5173`-ə yönləndirir
- lazım olsa backend üçün `127.0.0.1:3001` ayrıca açıq qalır

## YOLO + OCR qeydi

`VEHICLE_YOLO_MODEL` yalnız xüsusi hazırlanmış plate detector modeli olduqda doldurulur.
Əgər bu dəyişən boşdursa, layihənin son versiyası plate detektoru olmadan da OCR ilə işləməyə çalışır.

Ubuntu serverdə bu hissəni yeniləmək üçün:

```bash
cd /var/www/Anar
git pull
docker compose up -d --build
```

Əgər maşın nömrəsi tanınmırsa, serverdə `VEHICLE_YOLO_MODEL` düzgün model faylına yönəlməli və son `server/vehicle-vision.py` istifadə olunmalıdır.

## Qeyd

- `pm2` istifadə olunmur.
- `npm run dev` tələb olunmur.
- Hər şey `docker compose up -d --build` ilə qalxır.
