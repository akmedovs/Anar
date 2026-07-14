# Gloss Garage

Sedan və cip yuma, nano, polirovka və ximcistka üçün sayt.

## Nə var

- Public website
- Qiymət kataloqu
- Şəkilli iş jurnalı
- Admin panel
- PostgreSQL backup-friendly data storage

## Lokal işə salma

```bash
git clone https://github.com/akmedovs/Anar.git
cd Anar
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:3001
```

Health:

```bash
curl http://localhost:3001/api/health
```

## Environment

`.env.example` faylını kopyala:

```bash
cp .env.example .env
```

Əsas dəyişən:

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - backend portu, default `3001`
- `VEHICLE_VISION_COMMAND` - OCR skripti üçün python komandası
- `VEHICLE_YOLO_MODEL` - plate detector model yolu

## Qeydlər

- Data PostgreSQL-də saxlanır.
- Köhnə `server/db.json` varsa, ilk startda import olunur.
- İşlərə şəkil əlavə edilə bilər və admin paneldən xidmət qiymətləri dəyişilə bilər.
