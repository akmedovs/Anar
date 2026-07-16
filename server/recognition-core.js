import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const uploadsDir = path.resolve(process.cwd(), 'server/uploads/vehicle-captures');
const visionScript = path.resolve(process.cwd(), 'server/vehicle-vision.py');

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

loadEnvFile(path.resolve(process.cwd(), '.env'));

export function normalizePlate(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
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

export async function saveCaptureImage(imageDataUrl) {
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
  const timeoutMs = Number(process.env.VEHICLE_VISION_TIMEOUT_MS || 120000) || 120000;

  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.VEHICLE_VISION_COMMAND || 'python3',
      [visionScript, imagePath],
      {
        env: {
          ...process.env,
          VEHICLE_YOLO_MODEL: process.env.VEHICLE_YOLO_MODEL || '',
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

async function runVisionService(imagePath) {
  const baseUrl = String(process.env.VEHICLE_VISION_URL || 'http://vision:8000').trim().replace(/\/$/, '');
  const timeoutMs = Number(process.env.VEHICLE_VISION_HTTP_TIMEOUT_MS || process.env.VEHICLE_VISION_TIMEOUT_MS || 120000) || 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/recognize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imagePath }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Vision service ${response.status}: ${rawText.slice(0, 200)}`);
    }

    if (!rawText.trim()) {
      throw new Error('Vision service boş cavab qaytardı.');
    }

    return JSON.parse(rawText);
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `Vision service timeout after ${timeoutMs}ms.`
      : (error?.message || String(error));
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function runVisionPipeline(imagePath) {
  try {
    return await runVisionService(imagePath);
  } catch {
    return runVisionScript(imagePath);
  }
}

export async function recognizeImageAtPath(imagePath, input = {}) {
  let visionResult;
  try {
    visionResult = await runVisionPipeline(imagePath);
  } catch (error) {
    const timeoutHit = /timeout/i.test(String(error?.message || ''));
    visionResult = {
      status: 'manual_review',
      manualReviewRequired: true,
      reason: timeoutHit ? 'OCR timeout' : (error?.message || 'OCR failed'),
      candidates: [],
      backendsTried: [],
    };
  }

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
    : Number(visionResult.confidence);

  const responsePayload = {
    ok: true,
    saved: false,
    reviewRequired,
    reason: visionResult?.reason || null,
    captureUrl: String(input.captureUrl || ''),
    vision: visionResult,
    plate,
    displayPlate: visionResult?.displayPlate || plate,
    confidence: Number.isFinite(confidence) ? confidence : null,
    candidates: Array.isArray(visionResult?.candidates) ? visionResult.candidates : [],
    ocrBackendsTried: Array.isArray(visionResult?.backendsTried) ? visionResult.backendsTried : [],
    event: plate ? {
      plate,
      direction: input.direction === 'exit' ? 'exit' : 'entry',
      source: reviewRequired ? 'camera-review' : (String(input.source || 'camera').trim() || 'camera'),
      confidence: Number.isFinite(confidence) ? confidence : null,
      amount: Number(input.amount) || 0,
      note: String(input.note || '').trim(),
      imageUrl: String(input.captureUrl || ''),
      createdAt: String(input.createdAt || '').trim() || new Date().toISOString(),
    } : null,
  };

  if (!plate && !reviewRequired) {
    const error = new Error('Nömrə oxunmadı.');
    error.statusCode = 422;
    error.details = visionResult;
    error.captureUrl = String(input.captureUrl || '');
    throw error;
  }

  return responsePayload;
}
