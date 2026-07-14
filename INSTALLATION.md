# Ubuntu Server Installation

Bu sənəd `Gloss Garage` saytını Ubuntu serverdə PostgreSQL ilə qaldırmaq üçündür.

## Tövsiyə olunan resurslar

### Minimum

- 1 vCPU
- 2 GB RAM
- 20 GB SSD

### Tövsiyə olunan

- 2 vCPU
- 4 GB RAM
- 40 GB SSD

### Şəkil jurnalı çox olacaqsa

- 2 vCPU
- 4 GB RAM minimum
- 50 GB SSD daha rahatdır

## Paketlər

```bash
sudo apt update
sudo apt install -y git curl nginx python3 python3-pip tesseract-ocr postgresql postgresql-contrib
```

Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

PM2:

```bash
sudo npm install -g pm2
```

## PostgreSQL

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
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

## Deploy ardıcıllığı

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
npm install
cp .env.example .env
npm run build
PORT=3001 DATABASE_URL=postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar pm2 start server/server.js --name gloss-garage-api
pm2 save
pm2 startup
```

PM2-nin verdiyi əlavə `sudo` komandasını da icra et.

## Nginx

`/etc/nginx/sites-available/glossgarage`:

```nginx
server {
    listen 80;
    server_name glossgarage.az;

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

```bash
sudo ln -s /etc/nginx/sites-available/glossgarage /etc/nginx/sites-enabled/glossgarage
sudo nginx -t
sudo systemctl reload nginx
```

## Backup

```bash
pg_dump -Fc "postgres://anar_user:GUCLU_PAROL_YAZ@127.0.0.1:5432/anar" > /var/backups/glossgarage.dump
```

Restore:

```bash
pg_restore -d anar /var/backups/glossgarage.dump
```

## Qeyd

- Data PostgreSQL-də saxlanır.
- İş şəkilləri `server/uploads/glossgarage/` altına yazılır.
- `server/db.json` varsa ilk startda köçürülür.

