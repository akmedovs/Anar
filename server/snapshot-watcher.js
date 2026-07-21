#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { getRecognitionQueue } from './recognition-queue.js';

const { Pool } = pg;

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const watchDir = path.resolve(process.env.SNAPSHOT_WATCH_DIR || '/app/server/ftp-snapshots');
const uploadsDir = path.resolve(process.env.SNAPSHOT_UPLOADS_DIR || 'server/uploads/vehicle-captures');
const scanIntervalMs = Number(process.env.SNAPSHOT_SCAN_INTERVAL_MS || 3000) || 3000;
const processExisting = String(process.env.SNAPSHOT_PROCESS_EXISTING || 'false').toLowerCase() === 'true';
const defaultDirection = process.env.SNAPSHOT_DEFAULT_DIRECTION === 'exit' ? 'exit' : 'entry';
const defaultSource = String(process.env.SNAPSHOT_SOURCE || 'xvr-ftp').trim() || 'xvr-ftp';
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const pool = new Pool({ connectionString: databaseUrl });
const seen = new Set();
const pending = new Map();
let scanning = false;
let initialScanDone = false;

function isImage(filePath) {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

function normalizePublicPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function listSnapshotFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSnapshotFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isImage(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function alreadyQueued(sourcePath) {
  const result = await query(
    "SELECT 1 FROM recognition_jobs WHERE input->>'snapshotPath' = $1 LIMIT 1",
    [sourcePath],
  );
  return result.rowCount > 0;
}

async function isStable(filePath) {
  const fileStat = await stat(filePath);
  const previous = pending.get(filePath);
  pending.set(filePath, {
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    checkedAt: Date.now(),
  });

  return Boolean(previous && previous.size === fileStat.size && previous.mtimeMs === fileStat.mtimeMs && fileStat.size > 0);
}

async function createRecognitionJobFromSnapshot(sourcePath) {
  if (await alreadyQueued(sourcePath)) {
    seen.add(sourcePath);
    pending.delete(sourcePath);
    return null;
  }

  await mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(sourcePath).toLowerCase() || '.jpg';
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const targetPath = path.join(uploadsDir, fileName);
  await copyFile(sourcePath, targetPath);

  const publicPath = `/uploads/vehicle-captures/${normalizePublicPath(fileName)}`;
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const input = {
    source: defaultSource,
    direction: defaultDirection,
    snapshotPath: sourcePath,
    originalFileName: path.basename(sourcePath),
    createdAt: now,
  };

  const result = await query(
    `
      INSERT INTO recognition_jobs (
        public_id, status, source, direction, capture_url, image_path, input, plate, display_plate, confidence,
        reason, bbox, candidates, vision, detector_confidence, ocr_backend, manual_review_required, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING *
    `,
    [
      jobId,
      'queued',
      input.source,
      input.direction,
      publicPath,
      targetPath,
      JSON.stringify(input),
      '',
      '',
      null,
      '',
      null,
      JSON.stringify([]),
      JSON.stringify({}),
      null,
      '',
      true,
      now,
      now,
    ],
  );

  const queue = getRecognitionQueue();
  if (!queue) {
    console.warn('[snapshot-watcher] REDIS_URL yoxdur, recognition job queue-ya əlavə olunmadı:', jobId);
    return result.rows[0];
  }

  await queue.add(
    'recognize',
    {
      jobId,
      imagePath: targetPath,
      captureUrl: publicPath,
      input,
    },
    { jobId },
  );

  return result.rows[0];
}

async function scan() {
  if (scanning) return;
  scanning = true;

  try {
    if (!existsSync(watchDir)) {
      console.warn('[snapshot-watcher] watch folder yoxdur:', watchDir);
      return;
    }

    const files = await listSnapshotFiles(watchDir);
    for (const filePath of files) {
      if (seen.has(filePath)) continue;

      if (!processExisting && !initialScanDone) {
        seen.add(filePath);
        continue;
      }

      if (!await isStable(filePath)) continue;

      const job = await createRecognitionJobFromSnapshot(filePath);
      seen.add(filePath);
      pending.delete(filePath);
      if (job) {
        console.log('[snapshot-watcher] queued', job.public_id, filePath);
      }
    }
  } catch (error) {
    console.error('[snapshot-watcher] scan failed:', error?.message || error);
  } finally {
    initialScanDone = true;
    scanning = false;
  }
}

console.log('[snapshot-watcher] watching', watchDir);
console.log('[snapshot-watcher] direction', defaultDirection, 'source', defaultSource);
await scan();
const timer = setInterval(scan, scanIntervalMs);

async function shutdown() {
  clearInterval(timer);
  await pool.end();
  const queue = getRecognitionQueue();
  if (queue) await queue.close();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
