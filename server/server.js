import http from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.env.PORT) || 3001;
const dataFile = path.resolve(process.cwd(), 'server/db.json');
const uploadsDir = path.resolve(process.cwd(), 'server/uploads/vehicle-captures');
const visionScript = path.resolve(process.cwd(), 'server/vehicle-vision.py');
const visionCommand = process.env.VEHICLE_VISION_COMMAND || 'python3';
const visionModel = process.env.VEHICLE_YOLO_MODEL || '';
const visionOcrConfig = process.env.VEHICLE_OCR_CONFIG || '--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

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

const defaultState = {
  sequences: {
    reports: 1,
    vehicleEvents: 1,
    washExpenses: 1,
    washWaterReadings: 1,
  },
  reports: [],
  vehicleEvents: [],
  washExpenses: [],
  washWaterReadings: [],
};

let state = structuredClone(defaultState);
let saveQueue = Promise.resolve();

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

async function loadState() {
  try {
    const raw = await readFile(dataFile, 'utf8');
    return normalizeLoadedState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Lokal data fayli oxunmadı, yeni fayl yaradılır: ${error.message}`);
    }

    return structuredClone(defaultState);
  }
}

async function saveState() {
  const payload = JSON.stringify(state, null, 2);
  const tempFile = `${dataFile}.tmp`;

  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(tempFile, payload, 'utf8');
  await rename(tempFile, dataFile);
}

function persist() {
  saveQueue = saveQueue.then(() => saveState()).catch((error) => {
    console.error('Lokal data saxlanmadı:', error.message);
  });

  return saveQueue;
}

function nextId(key) {
  const id = Number(state.sequences[key]) || 1;
  state.sequences[key] = id + 1;
  return id;
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
    updatedAt: row.updatedAt,
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
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
  };
}

function expenseToResponse(row) {
  return {
    id: row.id,
    expenseDate: row.expenseDate,
    title: row.title,
    amount: toNumber(row.amount),
    note: row.note,
    createdAt: row.createdAt,
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
    createdAt: row.createdAt,
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
  return new Promise((resolve, reject) => {
    const child = execFile(
      visionCommand,
      [visionScript, imagePath],
      {
        env: {
          ...process.env,
          VEHICLE_YOLO_MODEL: visionModel,
          VEHICLE_OCR_CONFIG: visionOcrConfig,
        },
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.toString().trim() || error.message;
          reject(new Error(message));
          return;
        }

        const output = String(stdout || '').trim();
        if (!output) {
          reject(new Error('Vision script boş cavab qaytardı.'));
          return;
        }

        try {
          resolve(JSON.parse(output));
        } catch {
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
  const visionResult = await runVisionScript(capture.absPath);
  const plate = normalizePlate(visionResult?.plate || visionResult?.text || '');
  const confidence = visionResult?.confidence === undefined || visionResult?.confidence === null || visionResult?.confidence === ''
    ? null
    : toNumber(visionResult.confidence);

  if (!plate) {
    const error = new Error('Nömrə oxunmadı.');
    error.statusCode = 422;
    error.details = visionResult;
    error.captureUrl = capture.publicPath;
    throw error;
  }

  const payload = {
    plate,
    direction,
    source,
    confidence,
    amount: toNumber(input.amount),
    note: String(input.note || '').trim(),
    imageUrl: capture.publicPath,
    createdAt: createdAt || new Date().toISOString(),
  };

  if (!saveEvent) {
    return {
      ok: true,
      saved: false,
      captureUrl: capture.publicPath,
      vision: visionResult,
      event: payload,
    };
  }

  const event = await createVehicleEvent(payload);
  return {
    ok: true,
    saved: true,
    captureUrl: capture.publicPath,
    vision: visionResult,
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

function sortVehicleEvents(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id;
}

function sortExpenses(a, b) {
  return String(b.expenseDate).localeCompare(String(a.expenseDate)) || b.id - a.id;
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

  let rows = state.reports.slice();

  if (ilParam) {
    const il = Number(ilParam);
    rows = rows.filter((row) => Number(row.il) === il);
  }

  if (ayParam) {
    rows = rows.filter((row) => row.ay === ayParam);
  }

  return rows.sort(sortReports).map(reportToResponse);
}

async function createReport(input) {
  const report = normalizeReport(input);
  const row = {
    id: nextId('reports'),
    ...report,
  };

  state.reports.push(row);
  await persist();
  return reportToResponse(row);
}

async function updateReport(url, input) {
  const id = Number(url.searchParams.get('id'));
  const index = state.reports.findIndex((row) => row.id === id);

  if (index === -1) {
    const error = new Error('Qeyd tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  const updated = {
    ...state.reports[index],
    ...normalizeReport(input),
    id,
  };

  state.reports[index] = updated;
  await persist();
  return reportToResponse(updated);
}

async function deleteReport(url) {
  const id = Number(url.searchParams.get('id'));

  if (id) {
    state.reports = state.reports.filter((row) => row.id !== id);
    await persist();
    return;
  }

  const il = Number(url.searchParams.get('il')) || new Date().getFullYear();
  const ay = String(url.searchParams.get('ay') || '').trim();
  const ev = String(url.searchParams.get('ev') || '').trim();

  state.reports = state.reports.filter((row) => !(Number(row.il) === il && row.ay === ay && row.ev === ev));
  await persist();
}

async function listVehicleEvents() {
  return state.vehicleEvents.slice().sort(sortVehicleEvents).slice(0, 500).map(eventToResponse);
}

async function createVehicleEvent(input) {
  const row = {
    id: nextId('vehicleEvents'),
    ...normalizeVehicleEvent(input),
  };

  state.vehicleEvents.push(row);
  await persist();
  return eventToResponse(row);
}

async function updateVehicleEvent(url, input) {
  const id = Number(url.searchParams.get('id'));
  const index = state.vehicleEvents.findIndex((row) => row.id === id);

  if (index === -1) {
    const error = new Error('Maşın qeydi tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  const updated = {
    ...state.vehicleEvents[index],
    ...normalizeVehicleEvent(input),
    id,
  };

  state.vehicleEvents[index] = updated;
  await persist();
  return eventToResponse(updated);
}

async function deleteVehicleEvent(url) {
  const id = Number(url.searchParams.get('id'));

  if (!id) {
    const error = new Error('Maşın qeydi silmək üçün id mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  state.vehicleEvents = state.vehicleEvents.filter((row) => row.id !== id);
  await persist();
}

async function listWashExpenses(url) {
  const ilParam = url.searchParams.get('il');
  const ayParam = url.searchParams.get('ay');

  let rows = state.washExpenses.slice();

  if (ilParam) {
    const il = Number(ilParam);
    rows = rows.filter((row) => new Date(row.expenseDate).getFullYear() === il);
  }

  if (ayParam) {
    const month = monthIndex(ayParam);
    if (month >= 0) {
      rows = rows.filter((row) => new Date(row.expenseDate).getMonth() === month);
    }
  }

  return rows.sort(sortExpenses).slice(0, 1000).map(expenseToResponse);
}

async function createWashExpense(input) {
  const row = {
    id: nextId('washExpenses'),
    ...normalizeExpense(input),
  };

  state.washExpenses.push(row);
  await persist();
  return expenseToResponse(row);
}

async function updateWashExpense(url, input) {
  const id = Number(url.searchParams.get('id'));
  const index = state.washExpenses.findIndex((row) => row.id === id);

  if (index === -1) {
    const error = new Error('Xərc tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  const updated = {
    ...state.washExpenses[index],
    ...normalizeExpense(input),
    id,
  };

  state.washExpenses[index] = updated;
  await persist();
  return expenseToResponse(updated);
}

async function deleteWashExpense(url) {
  const id = Number(url.searchParams.get('id'));

  if (!id) {
    const error = new Error('Xərc silmək üçün id mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  state.washExpenses = state.washExpenses.filter((row) => row.id !== id);
  await persist();
}

async function listWaterReadings(url) {
  const ilParam = url.searchParams.get('il');
  const ayParam = url.searchParams.get('ay');

  let rows = state.washWaterReadings.slice();

  if (ilParam) {
    const il = Number(ilParam);
    rows = rows.filter((row) => Number(row.il) === il);
  }

  if (ayParam) {
    rows = rows.filter((row) => row.ay === ayParam);
  }

  return rows.sort(sortWaterReadings).slice(0, 1000).map(waterReadingToResponse);
}

async function createWaterReading(input) {
  const row = {
    id: nextId('washWaterReadings'),
    ...normalizeWaterReading(input),
  };

  state.washWaterReadings.push(row);
  await persist();
  return waterReadingToResponse(row);
}

async function updateWaterReading(url, input) {
  const id = Number(url.searchParams.get('id'));
  const index = state.washWaterReadings.findIndex((row) => row.id === id);

  if (index === -1) {
    const error = new Error('Su göstəricisi tapılmadı.');
    error.statusCode = 404;
    throw error;
  }

  const updated = {
    ...state.washWaterReadings[index],
    ...normalizeWaterReading(input),
    id,
  };

  state.washWaterReadings[index] = updated;
  await persist();
  return waterReadingToResponse(updated);
}

async function deleteWaterReading(url) {
  const id = Number(url.searchParams.get('id'));

  if (id) {
    state.washWaterReadings = state.washWaterReadings.filter((row) => row.id !== id);
    await persist();
    return;
  }

  const il = Number(url.searchParams.get('il')) || new Date().getFullYear();
  const ay = String(url.searchParams.get('ay') || '').trim();

  if (!ay) {
    const error = new Error('Su göstəricisi silmək üçün ay mütləqdir.');
    error.statusCode = 400;
    throw error;
  }

  state.washWaterReadings = state.washWaterReadings.filter((row) => !(Number(row.il) === il && row.ay === ay));
  await persist();
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
    sendJson(res, 200, { ok: true, database: 'json' });
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

loadState()
  .then((loadedState) => {
    state = loadedState;
    server.listen(port, '0.0.0.0', () => {
      console.log(`Backend http://localhost:${port} ünvanında işləyir`);
      console.log('Storage: local JSON');
    });
  })
  .catch((error) => {
    console.error('Lokal storage başladılmadı:', error.message);
    process.exit(1);
  });
