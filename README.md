# Anar - Kiraye ve Aftoyuma Hesabat Sistemi

Bu layihə React/Vite frontend, Node.js backend və PostgreSQL database ilə işləyir.

## Lazım Olanlar

- Node.js 20 və ya daha yeni
- npm
- PostgreSQL 14 və ya daha yeni
- Git

Default backend portu: `3001`

Default frontend dev portu: `5173`

Default database adı: `anar`

Default database connection:

```bash
postgres://postgres:postgres@127.0.0.1:5432/anar
```

## Serverə Yükləmə

Repo-nu serverə çəkin:

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
npm install
```

Production build yaradın:

```bash
npm run build
```

Build faylları `dist/` qovluğuna yazılır.

## PostgreSQL Qurulması

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

PostgreSQL statusunu yoxlayın:

```bash
sudo systemctl status postgresql
```

### macOS

Homebrew ilə:

```bash
brew install postgresql@16
brew services start postgresql@16
```

## Database Yaratmaq

Tövsiyə olunan production user və database:

- database adı: `anar`
- user adı: `anar_user`
- parolu serverdə güclü parol ilə dəyişin

Ubuntu/Debian serverdə:

```bash
sudo -u postgres psql
```

PostgreSQL console açılacaq. Bu komandaları icra edin:

```sql
CREATE DATABASE anar;
CREATE USER anar_user WITH PASSWORD 'BURADA_GUCLU_PAROL_YAZIN';
GRANT ALL PRIVILEGES ON DATABASE anar TO anar_user;
\c anar
GRANT ALL ON SCHEMA public TO anar_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anar_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anar_user;
\q
```

Connection test:

```bash
psql "postgres://anar_user:BURADA_GUCLU_PAROL_YAZIN@127.0.0.1:5432/anar" -c "SELECT 1;"
```

Uğurlu cavabda `1` görünməlidir.

## Environment Faylı

Layihə qovluğunda `.env` yaradın:

```bash
cp .env.example .env
```

`.env` faylını production dəyərləri ilə yeniləyin:

```bash
DATABASE_URL=postgres://anar_user:BURADA_GUCLU_PAROL_YAZIN@127.0.0.1:5432/anar
PORT=3001
```

Vacib: `.env` GitHub-a göndərilmir və göndərilməməlidir.

## Database Cədvəlləri

Backend start olanda bu cədvəlləri avtomatik yaradır:

- `reports`
- `vehicle_events`

Manual yaratmaq lazımdırsa:

```bash
psql "postgres://anar_user:BURADA_GUCLU_PAROL_YAZIN@127.0.0.1:5432/anar" -f server/schema.sql
```

`reports` cədvəlində unikal hesabat açarı:

```text
il + ay + ev
```

Eyni il/ay/ev yenidən saxlananda köhnə qeyd update olunur.

## Lokal Development

PostgreSQL hazır olduqdan sonra:

```bash
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

Backend:

```text
http://localhost:3001/
```

Health check:

```bash
curl http://localhost:3001/api/health
```

Gözlənən cavab:

```json
{"ok":true,"database":"postgresql"}
```

## Production Start

Sadə start:

```bash
npm run build
npm run server
```

Backend `PORT` env dəyərində, default olaraq `3001` portunda açılır.

Qeyd: `npm run server` API-ni başladır. Frontend üçün `dist/` qovluğu ayrıca Nginx və ya başqa static server ilə servis edilməlidir.

## PM2 İlə Production

PM2 quraşdırın:

```bash
sudo npm install -g pm2
```

App-i başladın:

```bash
DATABASE_URL="postgres://anar_user:BURADA_GUCLU_PAROL_YAZIN@127.0.0.1:5432/anar" PORT=3001 pm2 start server/server.js --name anar-api
pm2 save
pm2 startup
```

Loglara baxmaq:

```bash
pm2 logs anar-api
```

Restart:

```bash
pm2 restart anar-api
```

## Nginx Reverse Proxy Nümunəsi

Frontend `dist/` qovluğundan, API isə `3001` portundan servis edilə bilər.

Nümunə config:

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

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Nginx yoxlama və restart:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS üçün Certbot istifadə edin:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

## PWA / Telefon Üçün Quraşdırma

Layihədə PWA dəstəyi var:

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/app-icon.svg`

Deploy-dan sonra:

- iPhone: Safari ilə saytı açın, Share düyməsi, `Add to Home Screen`
- Android: Chrome ilə saytı açın, menu, `Install app` və ya `Add to Home screen`

PWA-nın düzgün işləməsi üçün production sayt HTTPS üzərində açılmalıdır.

## API Endpointlər

Health:

```bash
GET /api/health
```

Hesabat siyahısı:

```bash
GET /api/reports
GET /api/reports?il=2026
GET /api/reports?il=2026&ay=Iyul
```

Hesabat yaratmaq/update etmək:

```bash
POST /api/reports
Content-Type: application/json
```

Silmek:

```bash
DELETE /api/reports?il=2026&ay=Iyul&ev=K-1
```

Aftoyuma eventləri:

```bash
GET /api/vehicle-events
POST /api/vehicle-events
```

## Deploy Yoxlama Siyahısı

1. `git clone` edildi.
2. `npm install` uğurlu keçdi.
3. PostgreSQL işləyir.
4. `anar` database yaradıldı.
5. `anar_user` user yaradıldı.
6. `.env` faylında `DATABASE_URL` düzgün yazıldı.
7. `npm run build` uğurlu keçdi.
8. Backend `npm run server` və ya PM2 ilə başladı.
9. `curl http://localhost:3001/api/health` `ok: true` qaytardı.
10. Nginx domain-i frontend `dist/` qovluğuna yönləndirir.
11. `/api/` sorğuları backend portuna proxy olunur.
12. HTTPS aktivdir.
13. Telefonlarda PWA install test edildi.

## Problem Həlli

PostgreSQL bağlantı xətası:

```text
connect ECONNREFUSED 127.0.0.1:5432
```

Yoxlanacaq:

```bash
sudo systemctl status postgresql
psql "postgres://anar_user:BURADA_GUCLU_PAROL_YAZIN@127.0.0.1:5432/anar" -c "SELECT 1;"
```

Database yoxdur xətası:

```text
database "anar" does not exist
```

Həll:

```bash
sudo -u postgres createdb anar
```

Permission xətası:

```text
permission denied for schema public
```

Həll:

```bash
sudo -u postgres psql -d anar -c "GRANT ALL ON SCHEMA public TO anar_user;"
```

Frontend açılır, data gəlmir:

- backend işləyirmi yoxlayın
- `/api/health` cavab verir?
- Nginx `/api/` proxy config-i düzgündür?
- `.env` içində `DATABASE_URL` düzgündür?
