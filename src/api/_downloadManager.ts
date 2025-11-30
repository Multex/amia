import { randomUUID } from 'node:crypto';
import { rm, stat, readdir, mkdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { runYtDlp } from '../../server/ytdlp.js';
import { appConfig } from '../../server/config.js';

const TEMP_DIR = appConfig.download.tempDir;
const CLEANUP_INTERVAL_MS = appConfig.download.cleanupIntervalMs;
const TTL_MS = appConfig.download.ttlMs;

type DownloadStatus = 'pending' | 'in_progress' | 'completed' | 'error';
type FormatOption = 'mp4' | 'webm' | 'mp3';
type QualityOption = 'best' | '1080p' | '720p' | '480p' | 'audio';

interface DownloadFile {
  filename: string;
  downloadName: string;
  filePath: string;
  fileSize: number;
}

interface DownloadRecord {
  token: string;
  url: string;
  format: FormatOption;
  quality: QualityOption;
  status: DownloadStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  downloadCount: number;
  files: DownloadFile[];
  isPlaylist: boolean;
  totalFiles?: number;
  currentFileIndex?: number;
  error?: string;
  processClosed?: boolean;
}

const downloads = new Map<string, DownloadRecord>();

async function ensureTempDir() {
  await mkdir(TEMP_DIR, { recursive: true });
}

function buildArgs(format: FormatOption, quality: QualityOption, token: string) {
  const safeQuality =
    quality === 'audio' && format !== 'mp3' ? 'best' : quality;

  // Use %(autonumber)s to prevent filename collisions in playlists
  const outputTemplate = path.join(TEMP_DIR, `${token}-%(autonumber)s-%(title)s.%(ext)s`);

  const args: string[] = [
    '--no-call-home',
    '--no-part',
    '--yes-playlist',
    '--restrict-filenames',
    '--playlist-end',
    appConfig.download.maxPlaylistItems.toString(),
    '-o',
    outputTemplate
  ];

  if (format === 'mp3') {
    args.push(
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0'
    );
  }

  const videoQuality = (() => {
    switch (safeQuality) {
      case '1080p':
        return 1080;
      case '720p':
        return 720;
      case '480p':
        return 480;
      default:
        return undefined;
    }
  })();

  if (format === 'mp3') {
    args.push('-f', 'bestaudio/best');
  } else {
    const container = format === 'mp4' ? 'mp4' : 'webm';
    const heightConstraint = videoQuality
      ? `[height<=${videoQuality}]`
      : '';
    const formatSelector = [
      `bestvideo[ext=${container}]${heightConstraint}+bestaudio`,
      `best[ext=${container}]${heightConstraint}`,
      'best'
    ].join('/');
    args.push('-f', formatSelector);
    args.push('--merge-output-format', container);
  }

  return args;
}

async function resolveFiles(token: string): Promise<DownloadFile[]> {
  const entries = await readdir(TEMP_DIR);
  // Match files starting with token- but NOT ending in .zip (to avoid self-inclusion if we zip later)
  const matches = entries.filter((file) => file.startsWith(`${token}-`) && !file.endsWith('.zip'));

  const files: DownloadFile[] = [];
  for (const match of matches) {
    const fullPath = path.join(TEMP_DIR, match);
    try {
      const info = await stat(fullPath);
      files.push({
        filePath: fullPath,
        filename: match,
        downloadName: match.replace(`${token}-`, '').replace(/^\d+-/, ''), // Remove token and autonumber
        fileSize: info.size
      });
    } catch {
      // ignore missing files
    }
  }

  // Sort by filename (which includes autonumber) to keep playlist order
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

async function cleanupRecord(token: string) {
  const record = downloads.get(token);
  if (!record) return;

  // Delete all known files
  for (const file of record.files) {
    try {
      await rm(file.filePath, { force: true });
    } catch { /* ignore */ }
  }

  // Also try to delete any other files starting with token (zip, or partials)
  try {
    const entries = await readdir(TEMP_DIR);
    const related = entries.filter(f => f.startsWith(`${token}-`));
    for (const file of related) {
      await rm(path.join(TEMP_DIR, file), { force: true });
    }
  } catch { /* ignore */ }

  downloads.delete(token);
}

function cleanupExpired() {
  const now = Date.now();
  for (const [token, record] of downloads.entries()) {
    if (
      (record.status === 'completed' || record.status === 'error') &&
      record.expiresAt <= now
    ) {
      void cleanupRecord(token);
    }
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS).unref();

export async function startDownload(url: string, format: FormatOption, quality: QualityOption) {
  await ensureTempDir();
  const token = randomUUID();
  const createdAt = Date.now();
  const record: DownloadRecord = {
    token,
    url,
    format,
    quality,
    status: 'in_progress',
    progress: 0,
    createdAt,
    updatedAt: createdAt,
    expiresAt: createdAt + TTL_MS,
    downloadCount: 0,
    files: [],
    isPlaylist: false
  };

  downloads.set(token, record);

  const args = buildArgs(format, quality, token);
  const { events } = runYtDlp({
    url,
    args,
    maxFileSizeMb: appConfig.download.maxFileSizeMb
  });

  events.on('progress', (value) => {
    const current = downloads.get(token);
    if (!current) return;

    // If we are in a playlist, this progress is for the CURRENT file.
    // We could try to average it, but for now let's just show it.
    // Ideally we'd map (fileIndex * 100 + value) / totalFiles
    if (current.totalFiles && current.currentFileIndex !== undefined) {
      const base = (current.currentFileIndex - 1) / current.totalFiles * 100;
      const added = value / current.totalFiles;
      current.progress = Math.min(99, base + added);
    } else {
      current.progress = Math.max(current.progress, Math.min(100, value));
    }
    current.updatedAt = Date.now();
  });

  const handleLine = (line: string) => {
    // console.log(`[Debug] yt-dlp output: ${line}`); // Uncomment for verbose logs
    const current = downloads.get(token);
    if (!current) return;

    // Detect playlist
    if (line.includes('Downloading playlist')) {
      current.isPlaylist = true;
    }

    // Detect "Downloading video 1 of 5"
    const playlistProgress = line.match(/Downloading video (\d+) of (\d+)/);
    if (playlistProgress) {
      current.currentFileIndex = parseInt(playlistProgress[1], 10);
      current.totalFiles = parseInt(playlistProgress[2], 10);
      current.isPlaylist = true;
    }

    // Capture filenames
    let destination: string | undefined;
    if (line.includes('Destination:')) {
      destination = line.split('Destination:')[1]?.trim();
    }
    const mergeMatch = line.match(/Merging formats into "(.*)"/);
    if (mergeMatch && mergeMatch[1]) {
      destination = mergeMatch[1];
    }

    if (destination) {
      const normalized = path.isAbsolute(destination)
        ? destination
        : path.resolve(destination);

      // We don't add to record.files yet, we do it at the end to be sure
      // But we could track the "current" file here if needed
      current.updatedAt = Date.now();
    }

    if (line.toLowerCase().includes('error')) {
      current.error = line;
      current.updatedAt = Date.now();
    }
  };

  events.on('stdout', handleLine);
  events.on('stderr', handleLine);

  events.on('error', (error) => {
    const current = downloads.get(token);
    if (!current) return;
    current.status = 'error';
    current.error = error.message;
    current.updatedAt = Date.now();
    current.expiresAt = Date.now();
  });

  events.on('close', async (code) => {
    const current = downloads.get(token);
    if (!current) return;
    current.processClosed = true;
    current.updatedAt = Date.now();

    if (code !== 0) {
      current.status = 'error';
      current.error = current.error ?? `yt-dlp exited with code ${code ?? 'unknown'}`;
      current.expiresAt = Date.now();
      return;
    }

    try {
      // Resolve all downloaded files
      const files = await resolveFiles(token);

      if (files.length === 0) {
        current.status = 'error';
        current.error = 'No se encontraron archivos descargados.';
        current.expiresAt = Date.now();
        return;
      }

      current.files = files;
      current.status = 'completed';
      current.progress = 100;
      current.expiresAt = Date.now() + TTL_MS;

      // If multiple files were downloaded but we didn't detect playlist flag (rare), set it
      if (files.length > 1) {
        current.isPlaylist = true;
      }

    } catch (error) {
      current.status = 'error';
      current.error = error instanceof Error ? error.message : 'Fallo al preparar los archivos.';
      current.expiresAt = Date.now();
    }
  });

  return { token };
}

export function getDownload(token: string) {
  return downloads.get(token);
}

export function getDownloadStatus(token: string) {
  const record = downloads.get(token);
  if (!record) return undefined;

  return {
    token: record.token,
    status: record.status,
    progress: Math.round(record.progress),
    error: record.error,
    expiresAt: record.expiresAt,
    isPlaylist: record.isPlaylist,
    files: record.files.map(f => ({
      name: f.downloadName,
      size: f.fileSize
    }))
  };
}

export async function incrementDownloadCount(token: string) {
  const record = downloads.get(token);
  if (!record) return;

  record.downloadCount++;
  record.updatedAt = Date.now();

  const maxDownloads = appConfig.download.maxDownloadsPerFile;

  if (maxDownloads === 0) return;

  if (record.downloadCount >= maxDownloads) {
    record.expiresAt = Date.now();
    await cleanupRecord(token);
  }
}

export async function createZipStream(token: string) {
  const record = downloads.get(token);
  if (!record || record.status !== 'completed' || record.files.length === 0) {
    return undefined;
  }

  const zipPath = path.join(TEMP_DIR, `${token}-archive.zip`);

  // Check if zip already exists
  try {
    await stat(zipPath);
    // If exists, return stream
    const stream = createReadStream(zipPath);
    stream.on('close', () => incrementDownloadCount(token));
    return {
      stream,
      filename: `playlist-${token.slice(0, 8)}.zip`,
      size: (await stat(zipPath)).size
    };
  } catch {
    // Zip doesn't exist, create it
  }

  // Create ZIP
  return new Promise<{ stream: any, filename: string, size: number } | undefined>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    output.on('close', async () => {
      try {
        const size = (await stat(zipPath)).size;
        const readStream = createReadStream(zipPath);
        readStream.on('close', () => incrementDownloadCount(token));
        resolve({
          stream: readStream,
          filename: `playlist-${token.slice(0, 8)}.zip`,
          size
        });
      } catch (err) {
        reject(err);
      }
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    for (const file of record.files) {
      archive.file(file.filePath, { name: file.downloadName });
    }

    archive.finalize();
  });
}

export function createDownloadStream(token: string, fileIndex?: number) {
  const record = downloads.get(token);
  if (!record || record.status !== 'completed' || record.files.length === 0) {
    return undefined;
  }

  const maxDownloads = appConfig.download.maxDownloadsPerFile;
  if (maxDownloads > 0 && record.downloadCount >= maxDownloads) {
    return undefined;
  }

  // If index provided, download specific file
  if (fileIndex !== undefined && fileIndex >= 0 && fileIndex < record.files.length) {
    const file = record.files[fileIndex];
    const stream = createReadStream(file.filePath);
    // Increment count for individual files too, as per user request
    stream.on('close', () => incrementDownloadCount(token));

    return {
      stream,
      filename: file.downloadName,
      size: file.fileSize
    };
  }

  // Default: Return first file (backward compatibility)
  const file = record.files[0];
  const stream = createReadStream(file.filePath);
  stream.on('close', () => incrementDownloadCount(token));
  return {
    stream,
    filename: file.downloadName,
    size: file.fileSize
  };
}
