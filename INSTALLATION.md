# Ubuntu Server Installation

Bu sənəd `Anar` layihəsini Ubuntu serverdə sıfırdan qaldırmaq üçün hazırlanıb.

## 1. Server hazırlığı

```bash
sudo apt update
sudo apt install -y git curl nginx python3 python3-pip tesseract-ocr postgresql postgresql-contrib
```

Node.js 20 qur:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

PM2 qur:

```bash
sudo npm install -g pm2
```

## 2. PostgreSQL hazırla

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

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

## 3. Layihəni serverə çək

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
```

## 4. Faylları hazırla

```bash
npm install
cp .env.example .env
```

`.env` içində minimum bunlar olsun:

```bash
PORT=3001
DATABASE_URL=postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar
VEHICLE_VISION_COMMAND=python3
VEHICLE_YOLO_MODEL=
VEHICLE_YOLO_CONF=0.25
VEHICLE_OCR_CONFIG=--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-
```

## 5. Build et

```bash
npm run build
```

## 6. Backend-i başlat

```bash
PORT=3001 DATABASE_URL=postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar pm2 start server/server.js --name anar-api
pm2 save
pm2 startup
```

PM2 son sətirdən sonra verdiyi əlavə `sudo` komandasını da işlət.

## 7. Nginx əlavə et

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

Aktiv et:

```bash
sudo ln -s /etc/nginx/sites-available/anar /etc/nginx/sites-enabled/anar
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Yoxla

```bash
curl http://127.0.0.1:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## 9. Backup

Backup:

```bash
pg_dump -Fc "postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar" > /var/backups/anar.dump
```

Restore:

```bash
pg_restore -d anar /var/backups/anar.dump
```

## Qeyd

- `npm run dev` development üçün həm backend, həm frontend-i birlikdə açır.
- `npm run build` production build yaradır.
- `server/db.json` köhnə import üçün qala bilər, amma aktiv storage deyil.
- Recognition istifadə edəcəksənsə, Python OCR paketlərini ayrıca qur.
