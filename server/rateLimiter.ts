import { appConfig } from './config.js';

const MAX_REQUESTS = appConfig.rateLimit.maxRequests;
const WINDOW_MS = appConfig.rateLimit.windowMs;

type Counter = {
  timestamps: number[];
};

const buckets = new Map<string, Counter>();

function getBucket(key: string) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  return bucket;
}

export function checkRateLimit(key: string) {
  const now = Date.now();
  const bucket = getBucket(key);
  bucket.timestamps = bucket.timestamps.filter((value) => now - value < WINDOW_MS);

  if (bucket.timestamps.length >= MAX_REQUESTS) {
    return false;
  }

  bucket.timestamps.push(now);
  return true;
}
