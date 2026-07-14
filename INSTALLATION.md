# Ubuntu Server Installation

Bu sənəd `Anar` layihəsini Ubuntu serverdə Docker ilə sıfırdan qaldırmaq üçündür.

## 1. Server hazırlığı

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
```

## 2. Docker qur

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Docker Compose pluginini yoxla:

```bash
docker compose version
```

İstəsən istifadəçini docker qrupuna da əlavə et:

```bash
sudo usermod -aG docker $USER
```

Sonra sessiyanı yenilə.

## 3. Layihəni serverə çək

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

## 4. Konteynerləri qaldır

```bash
docker compose up -d --build
```

## 5. Yoxlama

Frontend:

```bash
curl http://127.0.0.1:8080
```

API health:

```bash
curl http://127.0.0.1:8080/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## 6. Dayandırmaq

```bash
docker compose down
```

## 7. Backup

PostgreSQL backup:

```bash
docker compose exec db pg_dump -U anar_user anar > anar.dump
```

Restore:

```bash
cat anar.dump | docker compose exec -T db psql -U anar_user -d anar
```

## 8. Domen bağlamaq istəyirsənsə

Ən sadə ssenari:

- DNS `glossgarage.az` -> server IP
- reverse proxy `glossgarage.az` -> `127.0.0.1:8080`

Bu repo içində `web` konteyner artıq `api`-yə proxy edir, ona görə əlavə backend proxy lazımdır.

## Qeyd

- `pm2` istifadə olunmur.
- Ayrı `npm run dev` mərhələsi yoxdur.
- Hər şey Docker Compose ilə qalxır.
