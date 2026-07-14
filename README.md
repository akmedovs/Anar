# Anar

Kirayə, Aftoyuma və admin idarəetməsi üçün React/Vite + Node.js + PostgreSQL layihəsi.

## Layihə nədir

- Frontend: React + Vite
- Backend: Node.js
- Storage: PostgreSQL
- Opsional: vehicle recognition üçün Python skripti

## Lokal işlətmə

Bu hissə development üçün nəzərdə tutulub. `npm run dev` həm backend-i, həm də frontend-i qaldırır.

1. Layihəni klonla.

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

2. Asılılıqları qur.

```bash
npm install
```

3. `.env` faylını hazırla.

```bash
cp .env.example .env
```

4. PostgreSQL işləsin və `.env` içində `DATABASE_URL` doğru olsun.

5. Layihəni başlad.

```bash
npm run dev
```

Gözlənən ünvanlar:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

Health check:

```bash
curl http://localhost:3001/api/health
```

## Build

Production build üçün:

```bash
npm run build
```

Yoxlama üçün:

```bash
npm run server
```

## Ubuntu serverdə qaldırma

Bu sıra ilə işlət:

1. Sistem paketlərini qur.

```bash
sudo apt update
sudo apt install -y git curl nginx python3 python3-pip tesseract-ocr postgresql postgresql-contrib
```

2. Node.js 20 qur.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

3. PM2 qur.

```bash
sudo npm install -g pm2
```

4. PostgreSQL-i işə sal.

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

5. Database və user yarat.

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE anar;
CREATE USER anar_user WITH PASSWORD 'GUCLU_PAROL_YAZ';
GRANT ALL PRIVILEGES ON DATABASE anar TO anar_user;
\c anar
GRANT ALL ON SCHEMA public TO anar_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anar_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anar_user;
\q
```

6. Layihəni serverə çək.

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

7. Asılılıqları qur.

```bash
npm install
```

8. `.env` faylını hazırla.

```bash
cp .env.example .env
```

9. `.env` içində minimum bunlar olsun.

```bash
PORT=3001
DATABASE_URL=postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar
VEHICLE_VISION_COMMAND=python3
VEHICLE_YOLO_MODEL=
VEHICLE_YOLO_CONF=0.25
VEHICLE_OCR_CONFIG=--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-
```

10. Build et.

```bash
npm run build
```

11. Backend-i PM2 ilə başlat.

```bash
PORT=3001 DATABASE_URL=postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar pm2 start server/server.js --name anar-api
pm2 save
pm2 startup
```

12. PM2-nin verdiyi əlavə `sudo` komandasını da işlə.

13. Nginx qur.

```bash
sudo nano /etc/nginx/sites-available/anar
```

Bu config-i yaz:

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/Anar/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

14. Nginx-i aktiv et.

```bash
sudo ln -s /etc/nginx/sites-available/anar /etc/nginx/sites-enabled/anar
sudo nginx -t
sudo systemctl reload nginx
```

15. Health check et.

```bash
curl http://127.0.0.1:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## Backup

Database backup:

```bash
pg_dump -Fc "postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar" > /var/backups/anar.dump
```

Restore:

```bash
pg_restore -d anar /var/backups/anar.dump
```

## Qeyd

- `npm run dev` development üçündür.
- `npm run build` production build üçündür.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
- Recognition feature istifadə edirsənsə, Python paketlərini ayrıca qur.
