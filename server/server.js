import http from 'node:http';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT) || 3001;
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/anar';

const pool = new Pool({
  connectionString: databaseUrl,
});

const monthOrder = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'İyun',
  'İyul',
  'Avqust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      il INTEGER NOT NULL,
      ay TEXT NOT NULL,
      ev TEXT NOT NULL,
      kiraye NUMERIC(12, 2) NOT NULL DEFAULT 0,
      kohne_isiq NUMERIC(12, 2) NOT NULL DEFAULT 0,
      yeni_isiq NUMERIC(12, 2) NOT NULL DEFAULT 0,
      serfiyyat NUMERIC(12, 2) NOT NULL DEFAULT 0,
      isiq_pulu NUMERIC(12, 2) NOT NULL DEFAULT 0,
      su_cem NUMERIC(12, 2) NOT NULL DEFAULT 0,
      wifi NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (il, ay, ev)
    );

    CREATE TABLE IF NOT EXISTS vehicle_events (
      id SERIAL PRIMARY KEY,
      plate TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
      source TEXT NOT NULL DEFAULT 'manual',
      confidence NUMERIC(5, 4),
      image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function toNumber(value) {
  return Number(value) || 0;
}

function reportFromRow(row) {
  return {
    id: row.id,
    il: Number(row.il),
    ay: row.ay,
    ev: row.ev,
    kiraye: toNumber(row.kiraye),
    kohneIsiq: toNumber(row.kohne_isiq),
    yeniIsiq: toNumber(row.yeni_isiq),
    serfiyyat: toNumber(row.serfiyyat),
    isiqPulu: toNumber(row.isiq_pulu),
    suCem: toNumber(row.su_cem),
    wifi: toNumber(row.wifi),
    total: toNumber(row.total),
    updatedAt: row.updated_at,
  };
}

function eventFromRow(row) {
  return {
    id: row.id,
    plate: row.plate,
    direction: row.direction,
    source: row.source,
    confidence: row.confidence === null ? null : Number(row.confidence),
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
}

function normalizeReport(input) {
  const il = Number(input.il) || new Date().getFullYear();
  const ay = String(input.ay || '').trim();
  const ev = String(input.ev || '').trim();

  if (!ay || !ev) {
    const error = new Error('İl, ay və ev/obyekt mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  return {
    il,
    ay,
    ev,
    kiraye: toNumber(input.kiraye),
    kohneIsiq: toNumber(input.kohneIsiq),
    yeniIsiq: toNumber(input.yeniIsiq),
    serfiyyat: toNumber(input.serfiyyat),
    isiqPulu: toNumber(input.isiqPulu),
    suCem: toNumber(input.suCem),
    wifi: toNumber(input.wifi),
    total: toNumber(input.total),
  };
}

function normalizeVehicleEvent(input) {
  return {
    plate: String(input.plate || '').trim().toUpperCase(),
    direction: input.direction === 'exit' ? 'exit' : 'entry',
    source: input.source || 'manual',
    confidence: input.confidence === undefined || input.confidence === '' ? null : Number(input.confidence),
    imageUrl: input.imageUrl || '',
  };
}

async function listReports(url) {
  const where = [];
  const values = [];

  if (url.searchParams.get('il')) {
    values.push(Number(url.searchParams.get('il')));
    where.push(`il = $${values.length}`);
  }

  if (url.searchParams.get('ay')) {
    values.push(url.searchParams.get('ay'));
    where.push(`ay = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT *
      FROM reports
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY il DESC, array_position($${values.length + 1}::text[], ay), ev
    `,
    [...values, monthOrder],
  );

  return result.rows.map(reportFromRow);
}

async function upsertReport(input) {
  const report = normalizeReport(input);
  const result = await pool.query(
    `
      INSERT INTO reports (
        il, ay, ev, kiraye, kohne_isiq, yeni_isiq, serfiyyat,
        isiq_pulu, su_cem, wifi, total, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (il, ay, ev)
      DO UPDATE SET
        kiraye = EXCLUDED.kiraye,
        kohne_isiq = EXCLUDED.kohne_isiq,
        yeni_isiq = EXCLUDED.yeni_isiq,
        serfiyyat = EXCLUDED.serfiyyat,
        isiq_pulu = EXCLUDED.isiq_pulu,
        su_cem = EXCLUDED.su_cem,
        wifi = EXCLUDED.wifi,
        total = EXCLUDED.total,
        updated_at = now()
      RETURNING *
    `,
    [
      report.il,
      report.ay,
      report.ev,
      report.kiraye,
      report.kohneIsiq,
      report.yeniIsiq,
      report.serfiyyat,
      report.isiqPulu,
      report.suCem,
      report.wifi,
      report.total,
    ],
  );

  return reportFromRow(result.rows[0]);
}

async function deleteReport(url) {
  const il = Number(url.searchParams.get('il')) || new Date().getFullYear();
  const ay = String(url.searchParams.get('ay') || '').trim();
  const ev = String(url.searchParams.get('ev') || '').trim();

  await pool.query('DELETE FROM reports WHERE il = $1 AND ay = $2 AND ev = $3', [il, ay, ev]);
}

async function listVehicleEvents() {
  const result = await pool.query('SELECT * FROM vehicle_events ORDER BY created_at DESC LIMIT 500');
  return result.rows.map(eventFromRow);
}

async function createVehicleEvent(input) {
  const event = normalizeVehicleEvent(input);
  const result = await pool.query(
    `
      INSERT INTO vehicle_events (plate, direction, source, confidence, image_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [event.plate, event.direction, event.source, event.confidence, event.imageUrl],
  );

  return eventFromRow(result.rows[0]);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, database: 'postgresql' });
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    sendJson(res, 200, await listReports(url));
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'POST') {
    sendJson(res, 200, await upsertReport(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'DELETE') {
    await deleteReport(url);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/vehicle-events' && req.method === 'GET') {
    sendJson(res, 200, await listVehicleEvents());
    return;
  }

  if (url.pathname === '/api/vehicle-events' && req.method === 'POST') {
    sendJson(res, 201, await createVehicleEvent(await readJson(req)));
    return;
  }

  sendJson(res, 404, { error: 'Endpoint tapılmadı.' });
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Server xətası.' });
  }
});

initDb()
  .then(() => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`Backend http://localhost:${port} ünvanında işləyir`);
      console.log('Database: PostgreSQL');
    });
  })
  .catch((error) => {
    console.error('PostgreSQL bağlantısı alınmadı:', error.message);
    console.error(`DATABASE_URL hazırda: ${databaseUrl}`);
    process.exit(1);
  });
