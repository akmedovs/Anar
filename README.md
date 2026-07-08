# Kirayə və Moyka Hesabatı

## Lokal Başlatma

Backend PostgreSQL istifadə edir. Default bağlantı:

```bash
postgres://postgres:postgres@127.0.0.1:5432/anar
```

Əvvəlcə database yaradın:

```bash
createdb anar
```

Başqa user/parol istifadə edirsinizsə:

```bash
DATABASE_URL=postgres://USER:PAROL@127.0.0.1:5432/anar npm run dev
```

Server start olanda `reports` və `vehicle_events` cədvəllərini avtomatik yaradır. Manual schema üçün [server/schema.sql](server/schema.sql) faylı var.

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173/`

Backend: `http://localhost:3001/`

## Səhifələr

- `/` - kirayə dashboard, illik/aylıq qrafik analizlər
- `/about` - moyka hesabatları
- `/admin` - hesabat girişi, il/ay/ev üzrə saxlanma

## Database

Əsas cədvəl: `reports`

Unikal hesabat açarı: `il + ay + ev`. Eyni il/ay/ev yenidən saxlananda köhnə qeyd update olunur.

Avtoyuma kamera inteqrasiyası üçün baza cədvəl: `vehicle_events`.

<!--

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
-->
