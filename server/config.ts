import 'dotenv/config';
import path from 'node:path';
import { supportedLanguages } from './i18n.js';

const MIN_MINUTES = 1;

function envInt(name: string, defaultValue: number, { min, max }: { min?: number; max?: number } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    return defaultValue;
  }
  if (min !== undefined && value < min) {
    return min;
  }
  if (max !== undefined && value > max) {
    return max;
  }
  return value;
}

const ttlMinutes = envInt('DOWNLOAD_TTL_MINUTES', 15, { min: MIN_MINUTES });
const cleanupMinutes = envInt('DOWNLOAD_CLEANUP_INTERVAL_MINUTES', 5, { min: MIN_MINUTES });
const rateWindowMinutes = envInt('DOWNLOAD_RATE_LIMIT_WINDOW_MINUTES', 60, { min: MIN_MINUTES });
const maxDownloads = envInt('DOWNLOAD_RATE_LIMIT_MAX', 5, { min: 1 });

const maxFileSizeMb = envInt('DOWNLOAD_MAX_FILE_SIZE_MB', 500, { min: 1 });
const maxDownloadsPerFile = envInt('DOWNLOAD_MAX_DOWNLOADS_PER_FILE', 1, { min: 0 });
const tempDir = process.env.DOWNLOAD_TEMP_DIR ?? 'temp';

// Language configuration
const language = process.env.LANGUAGE ?? 'en';
const lang = (supportedLanguages.includes(language as any) ? language : 'en') as 'en' | 'es';

export interface DownloadConfig {
  tempDir: string;
  ttlMs: number;
  cleanupIntervalMs: number;
  maxFileSizeMb: number;
  maxDownloadsPerFile: number;
  maxPlaylistItems: number;
  ttlMinutes: number;
  cleanupMinutes: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  windowMinutes: number;
}

export interface AppConfig {
  download: DownloadConfig;
  rateLimit: RateLimitConfig;
  language: 'en' | 'es';
}

export const appConfig: AppConfig = Object.freeze({
  download: {
    tempDir: path.resolve(tempDir),
    ttlMs: ttlMinutes * 60 * 1000,
    cleanupIntervalMs: cleanupMinutes * 60 * 1000,
    maxFileSizeMb,
    maxDownloadsPerFile,
    maxPlaylistItems: envInt('DOWNLOAD_MAX_PLAYLIST_ITEMS', 5, { min: 1 }),
    ttlMinutes,
    cleanupMinutes
  },
  rateLimit: {
    maxRequests: maxDownloads,
    windowMs: rateWindowMinutes * 60 * 1000,
    windowMinutes: rateWindowMinutes
  },
  language: lang as 'en' | 'es'
});
