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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

    CREATE TABLE IF NOT EXISTS wash_expenses (
      id SERIAL PRIMARY KEY,
      expense_date DATE NOT NULL,
      title TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wash_water_readings (
      id SERIAL PRIMARY KEY,
      il INTEGER NOT NULL,
      ay TEXT NOT NULL,
      old_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
      new_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
      price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 1,
      usage_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query('ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_il_ay_ev_key');
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

function expenseFromRow(row) {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    title: row.title,
    amount: toNumber(row.amount),
    note: row.note,
    createdAt: row.created_at,
  };
}

function waterReadingFromRow(row) {
  return {
    id: row.id,
    il: Number(row.il),
    ay: row.ay,
    oldReading: toNumber(row.old_reading),
    newReading: toNumber(row.new_reading),
    pricePerUnit: toNumber(row.price_per_unit),
    usageAmount: toNumber(row.usage_amount),
    total: toNumber(row.total),
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

function normalizeExpense(input) {
  const expenseDate = String(input.expenseDate || '').trim();
  const title = String(input.title || '').trim();

  if (!expenseDate || !title) {
    const error = new Error('Tarix və xərc adı mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  return {
    expenseDate,
    title,
    amount: toNumber(input.amount),
    note: String(input.note || '').trim(),
  };
}

function normalizeWaterReading(input) {
  const il = Number(input.il) || new Date().getFullYear();
  const ay = String(input.ay || '').trim();
  const oldReading = toNumber(input.oldReading);
  const newReading = toNumber(input.newReading);
  const pricePerUnit = Number(input.pricePerUnit) || 1;
  const usageAmount = Math.max(0, newReading - oldReading);

  if (!ay) {
    const error = new Error('Su göstəricisi üçün ay mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  return {
    il,
    ay,
    oldReading,
    newReading,
    pricePerUnit,
    usageAmount,
    total: Number((usageAmount * pricePerUnit).toFixed(2)),
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

async function createReport(input) {
  const report = normalizeReport(input);
  const result = await pool.query(
    `
      INSERT INTO reports (
        il, ay, ev, kiraye, kohne_isiq, yeni_isiq, serfiyyat,
        isiq_pulu, su_cem, wifi, total, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
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
  const id = Number(url.searchParams.get('id'));
  if (id) {
    await pool.query('DELETE FROM reports WHERE id = $1', [id]);
    return;
  }

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

async function listWashExpenses(url) {
  const where = [];
  const values = [];

  if (url.searchParams.get('il')) {
    values.push(Number(url.searchParams.get('il')));
    where.push(`EXTRACT(YEAR FROM expense_date) = $${values.length}`);
  }

  if (url.searchParams.get('ay')) {
    const monthIndex = monthOrder.indexOf(url.searchParams.get('ay')) + 1;
    if (monthIndex > 0) {
      values.push(monthIndex);
      where.push(`EXTRACT(MONTH FROM expense_date) = $${values.length}`);
    }
  }

  const result = await pool.query(
    `
      SELECT *
      FROM wash_expenses
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY expense_date DESC, id DESC
      LIMIT 1000
    `,
    values,
  );

  return result.rows.map(expenseFromRow);
}

async function createWashExpense(input) {
  const expense = normalizeExpense(input);
  const result = await pool.query(
    `
      INSERT INTO wash_expenses (expense_date, title, amount, note)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [expense.expenseDate, expense.title, expense.amount, expense.note],
  );

  return expenseFromRow(result.rows[0]);
}

async function listWaterReadings(url) {
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
      FROM wash_water_readings
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY il DESC, array_position($${values.length + 1}::text[], ay), id DESC
      LIMIT 1000
    `,
    [...values, monthOrder],
  );

  return result.rows.map(waterReadingFromRow);
}

async function createWaterReading(input) {
  const reading = normalizeWaterReading(input);
  const result = await pool.query(
    `
      INSERT INTO wash_water_readings (
        il, ay, old_reading, new_reading, price_per_unit, usage_amount, total
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      reading.il,
      reading.ay,
      reading.oldReading,
      reading.newReading,
      reading.pricePerUnit,
      reading.usageAmount,
      reading.total,
    ],
  );

  return waterReadingFromRow(result.rows[0]);
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
    sendJson(res, 200, await createReport(await readJson(req)));
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

  if (url.pathname === '/api/wash-expenses' && req.method === 'GET') {
    sendJson(res, 200, await listWashExpenses(url));
    return;
  }

  if (url.pathname === '/api/wash-expenses' && req.method === 'POST') {
    sendJson(res, 201, await createWashExpense(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/wash-water-readings' && req.method === 'GET') {
    sendJson(res, 200, await listWaterReadings(url));
    return;
  }

  if (url.pathname === '/api/wash-water-readings' && req.method === 'POST') {
    sendJson(res, 201, await createWaterReading(await readJson(req)));
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
