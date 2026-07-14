# Ubuntu Server Installation

Bu sənəd `Anar` layihəsini Ubuntu VPS/server üzərində ayağa qaldırmaq üçün yazılıb.

## Tövsiyə olunan resurslar

### Minimum

- 1 vCPU
- 2 GB RAM
- 20 GB SSD

Bu ölçü JSON storage ilə əsas frontend + backend üçün kifayətdir.

### Tövsiyə olunan

- 2 vCPU
- 4 GB RAM
- 40 GB SSD

Bu ölçü daha rahatdır və birdən çox istifadəçi üçün təhlükəsiz seçimdir.

### Recognition aktiv olacaqsa

Əgər `vehicle-vision.py` ilə nömrə oxuma funksiyasını da işlədəcəksənsə:

- 2 vCPU
- 4 GB RAM minimum
- 50 GB SSD daha rahatdır

GPU şərt deyil, amma detector modeli ağır işləyəcəksə yük artır.

## Serverdə lazım olan paketlər

```bash
sudo apt update
sudo apt install -y git curl nginx python3 python3-pip tesseract-ocr
```

Node.js 20 quraşdır:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

PM2 quraşdır:

```bash
sudo npm install -g pm2
```

## Layihəni yüklə

```bash
cd /var/www
git clone https://github.com/akmedovs/Anar.git
cd Anar
npm install
```

## Environment faylı

```bash
cp .env.example .env
```

İstəyə görə dəyiş:

```bash
PORT=3001
VEHICLE_VISION_COMMAND=python3
VEHICLE_YOLO_MODEL=/var/www/Anar/models/plate-yolo.pt
VEHICLE_YOLO_CONF=0.25
VEHICLE_OCR_CONFIG=--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-
```

## Build et

```bash
npm run build
```

## Backend-i işə sal

```bash
PORT=3001 pm2 start server/server.js --name anar-api
pm2 save
```

Server açılışında avtomatik başlasın:

```bash
pm2 startup
```

PM2-nin verdiyi əlavə əmri də icra et.

## Nginx config

`/etc/nginx/sites-available/anar` faylı yarat:

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

Enable et:

```bash
sudo ln -s /etc/nginx/sites-available/anar /etc/nginx/sites-enabled/anar
sudo nginx -t
sudo systemctl reload nginx
```

## Yoxlama

Backend:

```bash
curl http://127.0.0.1:3001/api/health
```

Frontend:

```bash
curl -I http://127.0.0.1
```

## Recognition üçün əlavə paketlər

Əgər nömrə oxuma funksiyasını aktiv edəcəksənsə, ayrıca Python paketləri də quraşdır:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install opencv-python ultralytics pytesseract
```

Sonra `VEHICLE_YOLO_MODEL` dəyişənində trained model yolunu göstər.

## Qeyd

- Bu layihə hazırkı vəziyyətdə PostgreSQL tələb etmir.
- Data `server/db.json` içində saxlanır.
- `server/db.json` və `server/uploads/` serverdə qalıcı saxlanmalıdır.

