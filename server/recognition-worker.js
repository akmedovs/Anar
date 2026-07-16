#!/usr/bin/env node
import pg from 'pg';
import { Worker } from 'bullmq';
import { getRedisConnection, RECOGNITION_QUEUE_NAME } from './recognition-queue.js';
import { recognizeImageAtPath } from './recognition-core.js';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new Pool({ connectionString: databaseUrl });

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

function jobToResponse(row) {
  return {
    id: row.id,
    jobId: row.public_id,
    status: row.status,
    source: row.source,
    direction: row.direction,
    captureUrl: row.capture_url,
    imagePath: row.image_path,
    plate: row.plate,
    displayPlate: row.display_plate,
    confidence: row.confidence === null ? null : toNumber(row.confidence),
    reason: row.reason,
    bbox: row.bbox || null,
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    manualReviewRequired: Boolean(row.manual_review_required),
    detectorConfidence: row.detector_confidence === null ? null : toNumber(row.detector_confidence),
    ocrBackend: row.ocr_backend || '',
    vehicleEventId: row.vehicle_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

async function fetchJob(publicId) {
  const result = await query('SELECT * FROM recognition_jobs WHERE public_id = $1', [publicId]);
  return result.rows[0] || null;
}

async function updateJob(publicId, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return fetchJob(publicId);

  const values = [];
  const assignments = [];
  for (const [index, key] of keys.entries()) {
    values.push(patch[key]);
    assignments.push(`${key} = $${index + 1}`);
  }
  values.push(publicId);

  await query(
    `UPDATE recognition_jobs SET ${assignments.join(', ')}, updated_at = now() WHERE public_id = $${values.length}`,
    values,
  );

  return fetchJob(publicId);
}

async function insertVehicleEvent(jobRow, result) {
  const eventInput = result.event || {};
  const parsedInput = typeof jobRow.input === 'string'
    ? (() => {
        try {
          return JSON.parse(jobRow.input);
        } catch {
          return {};
        }
      })()
    : (jobRow.input || {});

  const insert = await query(
    `
      INSERT INTO vehicle_events (
        plate, direction, source, confidence, image_url, created_at, recognition_job_public_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
    [
      eventInput.plate || result.plate || '',
      eventInput.direction || jobRow.direction,
      eventInput.source || 'camera-auto',
      eventInput.confidence === undefined || eventInput.confidence === null ? null : eventInput.confidence,
      eventInput.imageUrl || jobRow.capture_url || '',
      eventInput.createdAt || parsedInput.createdAt || new Date().toISOString(),
      jobRow.public_id,
    ],
  );

  return insert.rows[0];
}

async function processRecognitionJob(job) {
  const { jobId, imagePath, captureUrl, input = {} } = job.data || {};
  if (!jobId || !imagePath) {
    throw new Error('Invalid recognition job payload.');
  }

  const jobRow = await fetchJob(jobId);
  if (!jobRow) {
    throw new Error(`Recognition job not found: ${jobId}`);
  }

  await updateJob(jobId, {
    status: 'processing',
    reason: '',
  });

  try {
    const result = await recognizeImageAtPath(imagePath, {
      ...input,
      captureUrl,
    });

    const manualReviewRequired = Boolean(result.reviewRequired);
    if (manualReviewRequired) {
      const row = await updateJob(jobId, {
        status: 'manual_review',
        plate: result.plate || '',
        display_plate: result.displayPlate || result.plate || '',
        confidence: result.confidence,
        reason: result.reason || 'Təsdiq tələb olunur.',
        bbox: result.vision?.bbox ? JSON.stringify(result.vision.bbox) : null,
        candidates: JSON.stringify(result.candidates || []),
        vision: JSON.stringify(result.vision || {}),
        detector_confidence: result.detectorConfidence || null,
        ocr_backend: result.ocrBackend || '',
        manual_review_required: true,
        processed_at: new Date().toISOString(),
      });
      return jobToResponse(row);
    }

    const eventRow = await insertVehicleEvent(jobRow, result);
    const row = await updateJob(jobId, {
      status: 'approved',
      plate: result.plate || '',
      display_plate: result.displayPlate || result.plate || '',
      confidence: result.confidence,
      reason: result.reason || '',
      bbox: result.vision?.bbox ? JSON.stringify(result.vision.bbox) : null,
      candidates: JSON.stringify(result.candidates || []),
      vision: JSON.stringify(result.vision || {}),
      detector_confidence: result.detectorConfidence || null,
      ocr_backend: result.ocrBackend || '',
      manual_review_required: false,
      vehicle_event_id: eventRow.id,
      processed_at: new Date().toISOString(),
    });

    return jobToResponse(row);
  } catch (error) {
    const row = await updateJob(jobId, {
      status: 'failed',
      reason: error?.message || 'Recognition failed.',
      processed_at: new Date().toISOString(),
    });
    return jobToResponse(row);
  }
}

const worker = new Worker(RECOGNITION_QUEUE_NAME, processRecognitionJob, {
  connection: getRedisConnection(),
  concurrency: Number(process.env.RECOGNITION_WORKER_CONCURRENCY || 2),
});

worker.on('completed', (job, result) => {
  console.log('[recognition-worker] completed', job.id, result?.status || 'done');
});

worker.on('failed', (job, error) => {
  console.error('[recognition-worker] failed', job?.id, error?.message || error);
});

async function shutdown() {
  await worker.close();
  await pool.end();
  const connection = getRedisConnection();
  if (connection) await connection.quit();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
