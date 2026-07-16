import IORedis from 'ioredis';
import { Queue } from 'bullmq';

export const RECOGNITION_QUEUE_NAME = 'recognition-jobs';

let redisConnection = null;
let recognitionQueue = null;

export function getRedisConnection() {
  if (!process.env.REDIS_URL) return null;
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

export function getRecognitionQueue() {
  const connection = getRedisConnection();
  if (!connection) return null;

  if (!recognitionQueue) {
    recognitionQueue = new Queue(RECOGNITION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  return recognitionQueue;
}
