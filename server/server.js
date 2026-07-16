import http from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const envFile = path.resolve(process.cwd(), '.env');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(envFile);

const port = Number(process.env.PORT) || 3001;
const schemaFile = path.resolve(process.cwd(), 'server/schema.sql');
const legacyDataFile = path.resolve(process.cwd(), 'server/db.json');
const uploadsDir = path.resolve(process.cwd(), 'server/uploads/vehicle-captures');
const visionScript = path.resolve(process.cwd(), 'server/vehicle-vision.py');
const visionCommand = process.env.VEHICLE_VISION_COMMAND || 'python3';
const visionModel = process.env.VEHICLE_YOLO_MODEL || '';
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

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

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeMonth(value) {
  const month = String(value || '').trim();
  return monthOrder.includes(month) ? month : monthOrder[new Date().getMonth()];
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeLoadedState(parsed) {
  const reports = Array.isArray(parsed.reports) ? parsed.reports : [];
  const vehicleEvents = Array.isArray(parsed.vehicleEvents) ? parsed.vehicleEvents : [];
  const washExpenses = Array.isArray(parsed.washExpenses) ? parsed.washExpenses : [];
  const washWaterReadings = Array.isArray(parsed.washWaterReadings) ? parsed.washWaterReadings : [];

  let reportId = 1;
  let vehicleEventId = 1;
  let washExpenseId = 1;
  let washWaterReadingId = 1;

  const normalizedReports = reports.map((row, index) => {
    const id = parsePositiveId(row.id) || index + 1;
    reportId = Math.max(reportId, id + 1);

    return {
      id,
      il: Number(row.il) || new Date().getFullYear(),
      ay: normalizeMonth(row.ay),
      ev: String(row.ev || '').trim() || 'Naməlum',
      kiraye: toNumber(row.kiraye),
      kohne_isiq: toNumber(row.kohneIsiq ?? row.kohne_isiq),
      yeni_isiq: toNumber(row.yeniIsiq ?? row.yeni_isiq),
      serfiyyat: toNumber(row.serfiyyat),
      isiq_pulu: toNumber(row.isiqPulu ?? row.isiq_pulu),
      su_nefer: toNumber(row.suNefer ?? row.su_nefer),
      su_cem: toNumber(row.suCem ?? row.su_cem),
      wifi: toNumber(row.wifi),
      total: toNumber(row.total),
      updatedAt: normalizeDate(row.updatedAt ?? row.updated_at),
    };
  });

  const normalizedVehicleEvents = vehicleEvents.map((row, index) => {
    const id = parsePositiveId(row.id) || index + 1;
    vehicleEventId = Math.max(vehicleEventId, id + 1);

    return {
      id,
      plate: String(row.plate || '').trim().toUpperCase(),
      direction: row.direction === 'exit' ? 'exit' : 'entry',
      source: String(row.source || 'manual').trim() || 'manual',
      confidence: row.confidence === null || row.confidence === undefined || row.confidence === '' ? null : toNumber(row.confidence),
      imageUrl: String(row.imageUrl ?? row.image_url ?? ''),
      createdAt: normalizeDate(row.createdAt ?? row.created_at),
    };
  });

  const normalizedWashExpenses = washExpenses.map((row, index) => {
    const id = parsePositiveId(row.id) || index + 1;
    washExpenseId = Math.max(washExpenseId, id + 1);

    return {
      id,
      expenseDate: String(row.expenseDate ?? row.expense_date ?? '').trim() || new Date().toISOString().slice(0, 10),
      title: String(row.title || '').trim() || 'Xərc',
      amount: toNumber(row.amount),
      note: String(row.note || '').trim(),
      createdAt: normalizeDate(row.createdAt ?? row.created_at),
    };
  });

  const normalizedWaterReadings = washWaterReadings.map((row, index) => {
    const id = parsePositiveId(row.id) || index + 1;
    washWaterReadingId = Math.max(washWaterReadingId, id + 1);

    return {
      id,
      il: Number(row.il) || new Date().getFullYear(),
      ay: normalizeMonth(row.ay),
      oldReading: toNumber(row.oldReading ?? row.old_reading),
      newReading: toNumber(row.newReading ?? row.new_reading),
      pricePerUnit: toNumber(row.pricePerUnit ?? row.price_per_unit) || 1,
      usageAmount: toNumber(row.usageAmount ?? row.usage_amount),
      total: toNumber(row.total),
      createdAt: normalizeDate(row.createdAt ?? row.created_at),
    };
  });

  return {
    sequences: {
      reports: reportId,
      vehicleEvents: vehicleEventId,
      washExpenses: washExpenseId,
      washWaterReadings: washWaterReadingId,
    },
    reports: normalizedReports,
    vehicleEvents: normalizedVehicleEvents,
    washExpenses: normalizedWashExpenses,
    washWaterReadings: normalizedWaterReadings,
  };
}

async function initializeDatabase() {
  if (!pool) {
    throw new Error('DATABASE_URL is not set. PostgreSQL connection is required.');
  }

  const schema = await readFile(schemaFile, 'utf8');
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }

  const { rows: counts } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM reports) AS reports_count,
      (SELECT COUNT(*)::int FROM vehicle_events) AS vehicle_events_count,
      (SELECT COUNT(*)::int FROM wash_expenses) AS wash_expenses_count,
      (SELECT COUNT(*)::int FROM wash_water_readings) AS wash_water_readings_count
  `);

  const hasData = Object.values(counts[0] || {}).some((value) => Number(value) > 0);
  if (!hasData) {
    try {
      const raw = await readFile(legacyDataFile, 'utf8');
      await migrateLegacyJson(JSON.parse(raw));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Legacy JSON migration skipped: ${error.message}`);
      }
    }
  }
}

async function migrateLegacyJson(parsed) {
  const legacy = normalizeLoadedState(parsed || {});
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of legacy.reports) {
      await client.query(
        `
          INSERT INTO reports (
            id, il, ay, ev, kiraye, kohne_isiq, yeni_isiq, serfiyyat, isiq_pulu, su_nefer, su_cem, wifi, total, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `,
        [
          row.id,
          row.il,
          row.ay,
          row.ev,
          row.kiraye,
          row.kohne_isiq,
          row.yeni_isiq,
          row.serfiyyat,
          row.isiq_pulu,
          row.su_nefer,
          row.su_cem,
          row.wifi,
          row.total,
          row.updatedAt,
        ],
      );
    }

    for (const row of legacy.vehicleEvents) {
      await client.query(
        `
          INSERT INTO vehicle_events (
            id, plate, direction, source, confidence, image_url, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [row.id, row.plate, row.direction, row.source, row.confidence, row.imageUrl, row.createdAt],
      );
    }

    for (const row of legacy.washExpenses) {
      await client.query(
        `
          INSERT INTO wash_expenses (
            id, expense_date, title, amount, note, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [row.id, row.expenseDate, row.title, row.amount, row.note, row.createdAt],
      );
    }

    for (const row of legacy.washWaterReadings) {
      await client.query(
        `
          INSERT INTO wash_water_readings (
            id, il, ay, old_reading, new_reading, price_per_unit, usage_amount, total, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          row.id,
          row.il,
          row.ay,
          row.oldReading,
          row.newReading,
          row.pricePerUnit,
          row.usageAmount,
          row.total,
          row.createdAt,
        ],
      );
    }

    await client.query(`SELECT setval(pg_get_serial_sequence('reports', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM reports), 0), 1), true)`);
    await client.query(`SELECT setval(pg_get_serial_sequence('vehicle_events', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM vehicle_events), 0), 1), true)`);
    await client.query(`SELECT setval(pg_get_serial_sequence('wash_expenses', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM wash_expenses), 0), 1), true)`);
    await client.query(`SELECT setval(pg_get_serial_sequence('wash_water_readings', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM wash_water_readings), 0), 1), true)`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function getPool() {
  if (!pool) {
    throw new Error('DATABASE_URL is not set. PostgreSQL connection is required.');
  }

  return pool;
}

async function query(sql, params = []) {
  return getPool().query(sql, params);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function monthIndex(month) {
  return monthOrder.indexOf(month);
}

function reportToResponse(row) {
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
    suNefer: toNumber(row.su_nefer),
    suCem: toNumber(row.su_cem),
    wifi: toNumber(row.wifi),
    total: toNumber(row.total),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function eventToResponse(row) {
  return {
    id: row.id,
    plate: row.plate,
    direction: row.direction,
    source: row.source,
    confidence: row.confidence === null ? null : toNumber(row.confidence),
    minutes: toNumber(row.minutes),
    amount: toNumber(row.amount),
    note: String(row.note || '').trim(),
    imageUrl: row.imageUrl ?? row.image_url ?? '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function expenseToResponse(row) {
  return {
    id: row.id,
    expenseDate: row.expenseDate,
    title: row.title,
    amount: toNumber(row.amount),
    note: row.note,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function waterReadingToResponse(row) {
  return {
    id: row.id,
    il: Number(row.il),
    ay: row.ay,
    oldReading: toNumber(row.oldReading),
    newReading: toNumber(row.newReading),
    pricePerUnit: toNumber(row.pricePerUnit),
    usageAmount: toNumber(row.usageAmount),
    total: toNumber(row.total),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : row.created_at ? new Date(row.created_at).toISOString() : null,
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
    kohne_isiq: toNumber(input.kohneIsiq),
    yeni_isiq: toNumber(input.yeniIsiq),
    serfiyyat: toNumber(input.serfiyyat),
    isiq_pulu: toNumber(input.isiqPulu),
    su_nefer: toNumber(input.suNefer),
    su_cem: toNumber(input.suCem),
    wifi: toNumber(input.wifi),
    total: toNumber(input.total),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeVehicleEvent(input) {
  const createdAtInput = String(input.createdAt || '').trim();
  const createdAt = createdAtInput && !Number.isNaN(new Date(createdAtInput).getTime()) ? new Date(createdAtInput).toISOString() : new Date().toISOString();

  return {
    plate: String(input.plate || '').trim().toUpperCase(),
    direction: input.direction === 'exit' ? 'exit' : 'entry',
    source: String(input.source || 'manual').trim() || 'manual',
    confidence: input.confidence === undefined || input.confidence === '' ? null : toNumber(input.confidence),
    minutes: Math.max(0, toNumber(input.minutes)),
    amount: toNumber(input.amount),
    note: String(input.note || '').trim(),
    imageUrl: String(input.imageUrl || ''),
    createdAt,
  };
}

function parseDataUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');

  return { mimeType, buffer };
}

function mimeToExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  return 'jpg';
}

async function saveCaptureImage(imageDataUrl) {
  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) {
    const error = new Error('Şəkil data-url formatında olmalıdır.');
    error.statusCode = 400;
    throw error;
  }

  const ext = mimeToExtension(parsed.mimeType);
  const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
  const absPath = path.join(uploadsDir, fileName);

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(absPath, parsed.buffer);

  return {
    absPath,
    publicPath: `/uploads/vehicle-captures/${fileName}`,
  };
}

function runVisionScript(imagePath) {
  const timeoutMs = Number(process.env.VEHICLE_VISION_TIMEOUT_MS || 300000) || 300000;

  return new Promise((resolve, reject) => {
    const child = execFile(
      visionCommand,
      [visionScript, imagePath],
      {
      env: {
        ...process.env,
        VEHICLE_YOLO_MODEL: visionModel,
      },
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const stderrText = String(stderr || '').trim();
          const timedOut = Boolean(error.killed) || /timed out/i.test(error.message || '');
          const message = timedOut
            ? `Vision script timeout after ${timeoutMs}ms.`
            : (stderrText || error.message);
          console.error('[vehicle-vision] script failed', {
            imagePath,
            message,
            stderr: stderrText,
            timeoutMs,
          });
          reject(new Error(message));
          return;
        }

        const output = String(stdout || '').trim();
        if (!output) {
          console.error('[vehicle-vision] script returned empty output', { imagePath });
          reject(new Error('Vision script boş cavab qaytardı.'));
          return;
        }

        try {
          const parsed = JSON.parse(output);
          console.log('[vehicle-vision] script result', {
            imagePath,
            status: parsed?.status,
            reviewRequired: parsed?.manualReviewRequired,
            plate: parsed?.plate,
            source: parsed?.source,
            confidence: parsed?.confidence,
            topCandidates: Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, 3) : [],
          });
          resolve(parsed);
        } catch {
          console.error('[vehicle-vision] script returned invalid json', {
            imagePath,
            output: output.slice(0, 200),
          });
          reject(new Error(`Vision script JSON qaytarmadı: ${output.slice(0, 200)}`));
        }
      },
    );

    child.on('error', (error) => reject(error));
  });
}

function normalizePlate(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

async function recognizeVehicleCapture(input) {
  const imageDataUrl = String(input.imageDataUrl || '').trim();
  const saveEvent = input.save !== false;
  const direction = input.direction === 'exit' ? 'exit' : 'entry';
  const source = String(input.source || 'camera').trim() || 'camera';
  const createdAt = String(input.createdAt || '').trim();

  if (!imageDataUrl) {
    const error = new Error('Şəkil göndərilməlidir.');
    error.statusCode = 400;
    throw error;
  }

  const capture = await saveCaptureImage(imageDataUrl);
  console.log('[vehicle-vision] recognize request', {
    captureUrl: capture.publicPath,
    direction,
    source,
    createdAt: createdAt || null,
    imageBytes: imageDataUrl.length,
  });
  const visionResult = await runVisionScript(capture.absPath);
  const reviewRequired = Boolean(visionResult?.manualReviewRequired || visionResult?.status === 'manual_review');
  const plate = normalizePlate(
    visionResult?.plate
      || visionResult?.displayPlate
      || visionResult?.suggestedPlate
      || visionResult?.event?.plate
      || visionResult?.text
      || '',
  );
  const confidence = visionResult?.confidence === undefined || visionResult?.confidence === null || visionResult?.confidence === ''
    ? null
    : toNumber(visionResult.confidence);
  const responsePayload = {
    ok: true,
    saved: false,
    reviewRequired,
    reason: visionResult?.reason || null,
    captureUrl: capture.publicPath,
    vision: visionResult,
    plate,
    displayPlate: visionResult?.displayPlate || plate,
    confidence,
    candidates: Array.isArray(visionResult?.candidates) ? visionResult.candidates : [],
    ocrBackendsTried: Array.isArray(visionResult?.backendsTried) ? visionResult.backendsTried : [],
    event: plate ? {
      plate,
      direction,
      source: reviewRequired ? 'camera-review' : source,
      confidence,
      amount: toNumber(input.amount),
      note: String(input.note || '').trim(),
      imageUrl: capture.publicPath,
      createdAt: createdAt || new Date().toISOString(),
    } : null,
  };

  if (!plate && !reviewRequired) {
    console.error('[vehicle-vision] plate rejected', {
      captureUrl: capture.publicPath,
      visionResult,
    });
    const error = new Error('Nömrə oxunmadı.');
    error.statusCode = 422;
    error.details = visionResult;
    error.captureUrl = capture.publicPath;
    throw error;
  }

  if (reviewRequired || !saveEvent) {
    return responsePayload;
  }

  const event = await createVehicleEvent({
    plate,
    direction,
    source,
    confidence,
    amount: toNumber(input.amount),
    note: String(input.note || '').trim(),
    imageUrl: capture.publicPath,
    createdAt: createdAt || new Date().toISOString(),
  });
  return {
    ...responsePayload,
    saved: true,
    event,
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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
  };
}

function sortReports(a, b) {
  if (a.il !== b.il) return b.il - a.il;

  const monthDiff = monthIndex(a.ay) - monthIndex(b.ay);
  if (monthDiff !== 0) return monthDiff;

  return String(a.ev).localeCompare(String(b.ev), 'az');
}

function sortWaterReadings(a, b) {
  if (a.il !== b.il) return b.il - a.il;

  const monthDiff = monthIndex(a.ay) - monthIndex(b.ay);
  if (monthDiff !== 0) return monthDiff;

  return b.id - a.id;
}

async function listReports(url) {
  const ilParam = url.searchParams.get('il');
  const ayParam = url.searchParams.get('ay');
  const where = [];
  const params = [];

  if (ilParam) {
    params.push(Number(ilParam));
    where.push(`il = $${params.length}`);
  }

  if (ayParam) {
    params.push(ayParam);
    where.push(`ay = $${params.length}`);
  }

  const result = await query(
    `SELECT * FROM reports${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    params,
  );

  return result.rows.sort(sortReports).map(reportToResponse);
}

async function createReport(input) {
  const report = normalizeReport(input);
  const result = await query(
    `
      INSERT INTO reports (
        il, ay, ev, kiraye, kohne_isiq, yeni_isiq, serfiyyat, isiq_pulu, su_nefer, su_cem, wifi, total, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `,
    [
      report.il,
      report.ay,
      report.ev,
      report.kiraye,
      report.kohne_isiq,
      report.yeni_isiq,
      report.serfiyyat,
      report.isiq_pulu,
      report.su_nefer,
      report.su_cem,
      report.wifi,
      report.total,
      report.updatedAt,
    ],
  );

  return reportToResponse(result.rows[0]);
}

async function updateReport(url, input) {
  const id = Number(url.searchParams.get('id'));
  const report = normalizeReport(input);
  const result = await query(
    `
      UPDATE reports
      SET il = $1,
          ay = $2,
          ev = $3,
          kiraye = $4,
          kohne_isiq = $5,
          yeni_isiq = $6,
          serfiyyat = $7,
          isiq_pulu = $8,
          su_nefer = $9,
          su_cem = $10,
          wifi = $11,
          total = $12,
          updated_at = $13
      WHERE id = $14
      RETURNING *
    `,
    [
      report.il,
      report.ay,
      report.ev,
      report.kiraye,
      report.kohne_isiq,
      report.yeni_isiq,
      report.serfiyyat,
      report.isiq_pulu,
      report.su_nefer,
      report.su_cem,
      report.wifi,
      report.total,
      report.updatedAt,
      id,
    ],
  );

  if (result.rowCount === 0) {
    const error = new Error('Qeyd tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  return reportToResponse(result.rows[0]);
}

async function deleteReport(url) {
  const id = Number(url.searchParams.get('id'));

  if (id) {
    await query('DELETE FROM reports WHERE id = $1', [id]);
    return;
  }

  const il = Number(url.searchParams.get('il')) || new Date().getFullYear();
  const ay = String(url.searchParams.get('ay') || '').trim();
  const ev = String(url.searchParams.get('ev') || '').trim();

  await query('DELETE FROM reports WHERE il = $1 AND ay = $2 AND ev = $3', [il, ay, ev]);
}

async function listVehicleEvents() {
  const result = await query('SELECT * FROM vehicle_events ORDER BY created_at DESC, id DESC LIMIT 500');
  return result.rows.map(eventToResponse);
}

async function createVehicleEvent(input) {
  const row = normalizeVehicleEvent(input);
  const result = await query(
    `
      INSERT INTO vehicle_events (plate, direction, source, confidence, image_url, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,
    [row.plate, row.direction, row.source, row.confidence, row.imageUrl, row.createdAt],
  );

  return eventToResponse(result.rows[0]);
}

async function updateVehicleEvent(url, input) {
  const id = Number(url.searchParams.get('id'));
  const row = normalizeVehicleEvent(input);
  const result = await query(
    `
      UPDATE vehicle_events
      SET plate = $1,
          direction = $2,
          source = $3,
          confidence = $4,
          image_url = $5,
          created_at = $6
      WHERE id = $7
      RETURNING *
    `,
    [row.plate, row.direction, row.source, row.confidence, row.imageUrl, row.createdAt, id],
  );

  if (result.rowCount === 0) {
    const error = new Error('Maşın qeydi tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  return eventToResponse(result.rows[0]);
}

async function deleteVehicleEvent(url) {
  const id = Number(url.searchParams.get('id'));

  if (!id) {
    const error = new Error('Maşın qeydi silmək üçün id mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  await query('DELETE FROM vehicle_events WHERE id = $1', [id]);
}

async function listWashExpenses(url) {
  const ilParam = url.searchParams.get('il');
  const ayParam = url.searchParams.get('ay');
  const where = [];
  const params = [];

  if (ilParam) {
    params.push(Number(ilParam));
    where.push(`EXTRACT(YEAR FROM expense_date) = $${params.length}`);
  }

  if (ayParam) {
    const month = monthIndex(ayParam);
    if (month >= 0) {
      params.push(month + 1);
      where.push(`EXTRACT(MONTH FROM expense_date) = $${params.length}`);
    }
  }

  const result = await query(
    `SELECT * FROM wash_expenses${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY expense_date DESC, id DESC LIMIT 1000`,
    params,
  );

  return result.rows.map(expenseToResponse);
}

async function createWashExpense(input) {
  const row = normalizeExpense(input);
  const result = await query(
    `
      INSERT INTO wash_expenses (expense_date, title, amount, note, created_at)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `,
    [row.expenseDate, row.title, row.amount, row.note, row.createdAt],
  );

  return expenseToResponse(result.rows[0]);
}

async function updateWashExpense(url, input) {
  const id = Number(url.searchParams.get('id'));
  const row = normalizeExpense(input);
  const result = await query(
    `
      UPDATE wash_expenses
      SET expense_date = $1,
          title = $2,
          amount = $3,
          note = $4,
          created_at = $5
      WHERE id = $6
      RETURNING *
    `,
    [row.expenseDate, row.title, row.amount, row.note, row.createdAt, id],
  );

  if (result.rowCount === 0) {
    const error = new Error('Xərc tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  return expenseToResponse(result.rows[0]);
}

async function deleteWashExpense(url) {
  const id = Number(url.searchParams.get('id'));

  if (!id) {
    const error = new Error('Xərc silmək üçün id mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  await query('DELETE FROM wash_expenses WHERE id = $1', [id]);
}

async function listWaterReadings(url) {
  const ilParam = url.searchParams.get('il');
  const ayParam = url.searchParams.get('ay');
  const where = [];
  const params = [];

  if (ilParam) {
    params.push(Number(ilParam));
    where.push(`il = $${params.length}`);
  }

  if (ayParam) {
    params.push(ayParam);
    where.push(`ay = $${params.length}`);
  }

  const result = await query(
    `SELECT * FROM wash_water_readings${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY il DESC, ay DESC, id DESC LIMIT 1000`,
    params,
  );

  return result.rows.sort(sortWaterReadings).map(waterReadingToResponse);
}

async function createWaterReading(input) {
  const row = normalizeWaterReading(input);
  const result = await query(
    `
      INSERT INTO wash_water_readings (il, ay, old_reading, new_reading, price_per_unit, usage_amount, total, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `,
    [row.il, row.ay, row.oldReading, row.newReading, row.pricePerUnit, row.usageAmount, row.total, row.createdAt],
  );

  return waterReadingToResponse(result.rows[0]);
}

async function updateWaterReading(url, input) {
  const id = Number(url.searchParams.get('id'));
  const row = normalizeWaterReading(input);
  const result = await query(
    `
      UPDATE wash_water_readings
      SET il = $1,
          ay = $2,
          old_reading = $3,
          new_reading = $4,
          price_per_unit = $5,
          usage_amount = $6,
          total = $7,
          created_at = $8
      WHERE id = $9
      RETURNING *
    `,
    [row.il, row.ay, row.oldReading, row.newReading, row.pricePerUnit, row.usageAmount, row.total, row.createdAt, id],
  );

  if (result.rowCount === 0) {
    const error = new Error('Su göstəricisi tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  return waterReadingToResponse(result.rows[0]);
}

async function deleteWaterReading(url) {
  const id = Number(url.searchParams.get('id'));

  if (id) {
    await query('DELETE FROM wash_water_readings WHERE id = $1', [id]);
    return;
  }

  const il = Number(url.searchParams.get('il')) || new Date().getFullYear();
  const ay = String(url.searchParams.get('ay') || '').trim();

  if (!ay) {
    const error = new Error('Su göstəricisi silmək üçün ay mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  await query('DELETE FROM wash_water_readings WHERE il = $1 AND ay = $2', [il, ay]);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function contentTypeForUpload(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function serveUpload(url, res) {
  const relativePath = url.pathname.replace('/uploads/', '');
  const filePath = path.resolve(path.join(uploadsDir, relativePath));

  if (!filePath.startsWith(uploadsDir)) {
    sendJson(res, 403, { error: 'Yol tapılmadı.' });
    return true;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeForUpload(filePath),
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
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

  if (url.pathname.startsWith('/uploads/')) {
    const served = await serveUpload(url, res);
    if (served) return;
  }

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    sendJson(res, 200, await listReports(url));
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'POST') {
    sendJson(res, 200, await createReport(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'PUT') {
    sendJson(res, 200, await updateReport(url, await readJson(req)));
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

  if (url.pathname === '/api/vehicle-events/recognize' && req.method === 'POST') {
    sendJson(res, 201, await recognizeVehicleCapture(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/vehicle-events' && req.method === 'PUT') {
    sendJson(res, 200, await updateVehicleEvent(url, await readJson(req)));
    return;
  }

  if (url.pathname === '/api/vehicle-events' && req.method === 'DELETE') {
    await deleteVehicleEvent(url);
    sendJson(res, 200, { ok: true });
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

  if (url.pathname === '/api/wash-expenses' && req.method === 'PUT') {
    sendJson(res, 200, await updateWashExpense(url, await readJson(req)));
    return;
  }

  if (url.pathname === '/api/wash-expenses' && req.method === 'DELETE') {
    await deleteWashExpense(url);
    sendJson(res, 200, { ok: true });
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

  if (url.pathname === '/api/wash-water-readings' && req.method === 'PUT') {
    sendJson(res, 200, await updateWaterReading(url, await readJson(req)));
    return;
  }

  if (url.pathname === '/api/wash-water-readings' && req.method === 'DELETE') {
    await deleteWaterReading(url);
    sendJson(res, 200, { ok: true });
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

initializeDatabase()
  .then(() => server.listen(port, '0.0.0.0', () => {
    console.log(`Backend http://localhost:${port} ünvanında işləyir`);
    console.log('Storage: PostgreSQL');
  }))
  .catch((error) => {
    console.error('PostgreSQL başladılmadı:', error.message);
    process.exit(1);
  });
