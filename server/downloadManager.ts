import { randomUUID } from "node:crypto";
import { rm, stat, readdir, mkdir, rename } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { runYtDlp } from "./ytdlp.js";
import { runSomeDl } from "./somedl.js";
import { appConfig } from "./config.js";

// Sanitize an error message before sending it to clients.
// Strips absolute file paths and other server-internal details that
// yt-dlp routinely includes in its output. The raw error is always
// logged to stdout so it still shows up in Docker / server logs.
function sanitizeError(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  // Strip Unix absolute paths e.g. /app/temp/uuid-file.mp4
  let msg = raw.replace(/\/[\w\-\.\/]+/g, "[path]");
  // Also strip Windows paths
  msg = msg.replace(/[A-Za-z]:\\[^\s]*/g, "[path]");
  // Limit length
  msg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
  return msg;
}

const TEMP_DIR = appConfig.download.tempDir;
const CLEANUP_INTERVAL_MS = appConfig.download.cleanupIntervalMs;
const TTL_MS = appConfig.download.ttlMs;
const JOB_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-|$)/;

// Tracks how many yt-dlp processes are currently running.
// Incremented when a download starts, decremented exactly once
// when the process ends (success or error).
let activeDownloads = 0;

export function getActiveDownloads(): number {
  return activeDownloads;
}

type DownloadStatus = "pending" | "in_progress" | "completed" | "error";
type FormatOption = "mp4" | "webm" | "mp3" | "wav";
type QualityOption = "best" | "1080p" | "720p" | "480p" | "audio";

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
  // What the page tells the visitor while status is in_progress
  stage: "preparing" | "downloading" | "processing";
  progress: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  downloadCount: number;
  files: DownloadFile[];
  isPlaylist: boolean;
  metadata: boolean;
  totalFiles?: number;
  currentFileIndex?: number;
  error?: string;
  processClosed?: boolean;
  cancel?: () => void;
}

const downloads = new Map<string, DownloadRecord>();

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

// Keeps visitors anonymous: never log the link, title, file name, IP or token.
function logResult(record: DownloadRecord, failure?: string) {
  const kind: string[] = [record.format, record.quality];
  if (record.metadata) kind.push("metadata");
  if (record.isPlaylist) kind.push("playlist");
  const took = formatDuration(Date.now() - record.createdAt);
  if (failure) {
    console.log(`[download] failed ${kind.join(" ")} after ${took}: ${failure}`);
    return;
  }
  const count = record.files.length;
  const mb = record.files.reduce((sum, f) => sum + f.fileSize, 0) / 1024 / 1024;
  console.log(
    `[download] done ${kind.join(" ")} ${count} ${count === 1 ? "file" : "files"} ${mb.toFixed(mb < 10 ? 1 : 0)} MB ${took}`,
  );
}

async function ensureTempDir() {
  await mkdir(TEMP_DIR, { recursive: true });
}

function buildArgs(
  format: FormatOption,
  quality: QualityOption,
  token: string,
  downloadPlaylist: boolean,
) {
  const safeQuality =
    quality === "audio" && format !== "mp3" ? "best" : quality;

  // Use %(autonumber)s to prevent filename collisions in playlists
  const outputTemplate = path.join(
    TEMP_DIR,
    `${token}-%(autonumber)s-%(title)s.%(ext)s`,
  );

  const args: string[] = [
    "--no-call-home",
    "--no-part",
    "--restrict-filenames",
    "-o",
    outputTemplate,
  ];

  // Handle playlist vs single video
  if (downloadPlaylist) {
    args.push("--yes-playlist");
    args.push("--playlist-end", appConfig.download.maxPlaylistItems.toString());
  } else {
    args.push("--no-playlist");
  }

  if (format === "mp3" || format === "wav") {
    args.push(
      "--extract-audio",
      "--audio-format",
      format,
      "--audio-quality",
      "0",
    );
  }

  const videoQuality = (() => {
    switch (safeQuality) {
      case "1080p":
        return 1080;
      case "720p":
        return 720;
      case "480p":
        return 480;
      default:
        return undefined;
    }
  })();

  if (format === "mp3" || format === "wav") {
    args.push("-f", "bestaudio/best");
  } else {
    const container = format === "mp4" ? "mp4" : "webm";
    const heightConstraint = videoQuality ? `[height<=${videoQuality}]` : "";
    const formatSelector = [
      `bestvideo[ext=${container}]${heightConstraint}+bestaudio`,
      `best[ext=${container}]${heightConstraint}`,
      "best",
    ].join("/");
    args.push("-f", formatSelector);
    args.push("--merge-output-format", container);
  }

  return args;
}

async function resolveFiles(token: string): Promise<DownloadFile[]> {
  const entries = await readdir(TEMP_DIR);
  // Match files starting with token- but NOT ending in .zip (to avoid self-inclusion if we zip later)
  const matches = entries.filter(
    (file) => file.startsWith(`${token}-`) && !file.endsWith(".zip"),
  );

  const files: DownloadFile[] = [];
  for (const match of matches) {
    const fullPath = path.join(TEMP_DIR, match);
    try {
      const info = await stat(fullPath);
      files.push({
        filePath: fullPath,
        filename: match,
        downloadName: match.replace(`${token}-`, "").replace(/^\d+-/, ""), // Remove token and autonumber
        fileSize: info.size,
      });
    } catch {
      // ignore missing files
    }
  }

  // Sort by filename (which includes autonumber) to keep playlist order
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

// Jobs only live in memory, so files from before a restart have no owner.
// Only touches names starting with a UUID, in case the temp dir is shared.
async function removeOrphanedFiles() {
  try {
    const entries = await readdir(TEMP_DIR);
    for (const entry of entries.filter((name) => JOB_FILE.test(name))) {
      await rm(path.join(TEMP_DIR, entry), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}

// SomeDL has no size option, so check its folder while it runs.
function watchFileSizes(cwd: string, onTooLarge: () => void) {
  const maxBytes = appConfig.download.maxFileSizeMb * 1024 * 1024;
  return setInterval(async () => {
    try {
      for (const file of await readdir(cwd)) {
        if ((await stat(path.join(cwd, file))).size > maxBytes) {
          onTooLarge();
          return;
        }
      }
    } catch {
      /* folder is gone or a file was just renamed */
    }
  }, 2000).unref();
}

async function cleanupRecord(token: string) {
  const record = downloads.get(token);
  if (!record) return;

  // Delete all known files
  for (const file of record.files) {
    try {
      await rm(file.filePath, { force: true });
    } catch {
      /* ignore */
    }
  }

  // Also delete anything else from this job: zip, partials, SomeDL's folder
  try {
    const entries = await readdir(TEMP_DIR);
    const related = entries.filter(
      (f) => f === token || f.startsWith(`${token}-`),
    );
    for (const file of related) {
      await rm(path.join(TEMP_DIR, file), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }

  downloads.delete(token);
}

function cleanupExpired() {
  const now = Date.now();
  const STALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const MAX_JOB_MS = 60 * 60 * 1000; // 1 hour, even if it's still progressing

  for (const [token, record] of downloads.entries()) {
    if (
      (record.status === "completed" || record.status === "error") &&
      record.expiresAt <= now
    ) {
      void cleanupRecord(token);
    } else if (
      record.status === "in_progress" &&
      (now - record.updatedAt > STALL_TIMEOUT_MS ||
        now - record.createdAt > MAX_JOB_MS)
    ) {
      record.status = "error";
      record.error = "Download timed out.";
      logResult(record, record.error);
      if (record.cancel) record.cancel();
      record.processClosed = true;
      void cleanupRecord(token);
    }
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS).unref();
void removeOrphanedFiles();

export async function startDownload(
  url: string,
  format: FormatOption,
  quality: QualityOption,
  downloadPlaylist: boolean = false,
  metadata: boolean = false,
) {
  const token = randomUUID();
  const createdAt = Date.now();
  const record: DownloadRecord = {
    token,
    url,
    format,
    quality,
    status: "in_progress",
    stage: "preparing",
    progress: 0,
    createdAt,
    updatedAt: createdAt,
    expiresAt: createdAt + TTL_MS,
    downloadCount: 0,
    files: [],
    isPlaylist: false,
    metadata,
  };

  // Reserve the slot before the first await, so requests arriving together
  // can't all pass the concurrency check.
  downloads.set(token, record);
  activeDownloads++;

  // Ensures the counter is decremented exactly once regardless of
  // whether the process errors, closes normally, or both events fire.
  let concurrencyReleased = false;
  const releaseConcurrency = () => {
    if (!concurrencyReleased) {
      concurrencyReleased = true;
      activeDownloads--;
    }
  };

  let events;
  try {
    await ensureTempDir();
    let childProcess;
    if (metadata && format === "mp3") {
      const cwd = path.join(TEMP_DIR, token);
      await mkdir(cwd, { recursive: true });
      const res = runSomeDl({
        url,
        cwd,
        downloadPlaylist,
        maxPlaylistItems: appConfig.download.maxPlaylistItems,
      });
      events = res.events;
      childProcess = res.child;
      const sizeWatch = watchFileSizes(cwd, () => {
        record.error = `File is over the ${appConfig.download.maxFileSizeMb} MB limit.`;
        record.cancel?.();
      });
      events.once("close", () => clearInterval(sizeWatch));
    } else {
      const args = buildArgs(format, quality, token, downloadPlaylist);
      const res = runYtDlp({
        url,
        args,
        maxFileSizeMb: appConfig.download.maxFileSizeMb,
      });
      events = res.events;
      childProcess = res.child;
    }

    record.cancel = () => {
      try {
        if (childProcess.pid) process.kill(-childProcess.pid, "SIGKILL");
      } catch {
        // Already dead
      }
    };
  } catch (error) {
    downloads.delete(token);
    releaseConcurrency();
    throw error;
  }

  events.on("progress", (value: number) => {
    const current = downloads.get(token);
    if (!current) return;

    // If we are in a playlist, this progress is for the CURRENT file.
    // We could try to average it, but for now let's just show it.
    // Ideally we'd map (fileIndex * 100 + value) / totalFiles
    if (current.totalFiles && current.currentFileIndex !== undefined) {
      const base = ((current.currentFileIndex - 1) / current.totalFiles) * 100;
      const added = value / current.totalFiles;
      // Max because video and audio each count from 0 within the same item
      current.progress = Math.max(current.progress, Math.min(99, base + added));
    } else {
      current.progress = Math.max(current.progress, Math.min(100, value));
    }
    current.stage = "downloading";
    current.updatedAt = Date.now();
  });

  const handleLine = (line: string) => {
    // console.log(`[Debug] yt-dlp output: ${line}`); // Uncomment for verbose logs
    const current = downloads.get(token);
    if (!current) return;

    // ffmpeg steps after the download: merging video and audio, converting audio, fixing streams
    if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer|Fixup\w*)\]/.test(line)) {
      current.stage = "processing";
    }

    // Detect playlist
    if (line.includes("Downloading playlist")) {
      current.isPlaylist = true;
    }

    // Detect "Downloading video 1 of 5"
    const playlistProgress = line.match(/Downloading (?:item|video) (\d+) of (\d+)/);
    if (playlistProgress) {
      current.currentFileIndex = parseInt(playlistProgress[1], 10);
      current.totalFiles = parseInt(playlistProgress[2], 10);
      current.isPlaylist = true;
    }

    // Capture filenames
    let destination: string | undefined;
    if (line.includes("Destination:")) {
      destination = line.split("Destination:")[1]?.trim();
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

    if (line.toLowerCase().includes("error")) {
      current.error = line;
      current.updatedAt = Date.now();
    }
  };

  events.on("stdout", handleLine);
  events.on("stderr", handleLine);

  events.on("error", (error: Error) => {
    const current = downloads.get(token);
    if (!current) return;
    current.status = "error";
    current.error = error.message;
    current.updatedAt = Date.now();
    current.expiresAt = Date.now();
    // "close" can follow; this stops it logging the same job twice
    current.processClosed = true;
    releaseConcurrency();
    logResult(current, `couldn't run the downloader (${error.message})`);
  });

  events.on("close", async (code: number | null) => {
    const current = downloads.get(token);
    
    if (!current) {
        releaseConcurrency();  // FIX: release even if record was cleaned up
        return;
    }
    
    if (current.processClosed) {
        releaseConcurrency();  // Already handled by stall timeout
        return;
    }
    
    current.processClosed = true;
    current.updatedAt = Date.now();

    if (code !== 0) {
      current.status = "error";
      current.error =
        current.error ?? `yt-dlp exited with code ${code ?? "unknown"}`;
      current.expiresAt = Date.now();
      releaseConcurrency();
      // Lines captured from yt-dlp contain "error" and can include video IDs, so only our own messages get logged
      logResult(
        current,
        /error/i.test(current.error) ? `exit code ${code ?? "unknown"}` : current.error,
      );
      return;
    }

    // FIX: Wrap entire success path in try/finally to ALWAYS release concurrency
    try {
      // If metadata and mp3, SomeDL was used inside a subdirectory. Move the file up.
      if (metadata && format === "mp3") {
        const cwd = path.join(TEMP_DIR, token);
        try {
          const dlFiles = await readdir(cwd);
          for (const file of dlFiles) {
            if (file.endsWith(".mp3")) {
              await rename(path.join(cwd, file), path.join(TEMP_DIR, `${token}-1-${file}`));
            }
          }
          await rm(cwd, { recursive: true, force: true });
        } catch (err) {
          // If SomeDL produced no .mp3 files, this will throw and we handle it below
          console.error("[download] SomeDL cleanup error:", (err as NodeJS.ErrnoException).code);
        }
      }

      // Resolve all downloaded files
      const files = await resolveFiles(token);

      if (files.length === 0) {
        current.status = "error";
        current.error = "No files were downloaded.";
        current.expiresAt = Date.now();
        logResult(current, current.error);
        return;
      }

      current.files = files;
      current.status = "completed";
      current.progress = 100;
      current.expiresAt = Date.now() + TTL_MS;

      // If multiple files were downloaded but we didn't detect playlist flag (rare), set it
      if (files.length > 1) {
        current.isPlaylist = true;
      }
      logResult(current);
    } catch (error) {
      current.status = "error";
      current.error =
        error instanceof Error ? error.message : "Failed to prepare files.";
      current.expiresAt = Date.now();
      // The error message can hold a file path with the video title
      logResult(current, "couldn't prepare the files");
    } finally {
      // FIX: Always release concurrency, no matter what happened above
      releaseConcurrency();
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
    stage: record.stage,
    currentItem: record.currentFileIndex,
    totalItems: record.totalFiles,
    progress: Math.round(record.progress),
    error: sanitizeError(record.error),
    expiresAt: record.expiresAt,
    isPlaylist: record.isPlaylist,
    files: record.files.map((f) => ({
      name: f.downloadName,
      size: f.fileSize,
    })),
  };
}

// A dropped transfer doesn't count, so the file can be retried until it expires.
export async function finishDownload(token: string, completed: boolean) {
  const record = downloads.get(token);
  if (!record) return;

  if (!completed) {
    record.downloadCount--;
    return;
  }

  const maxDownloads = appConfig.download.maxDownloadsPerFile;

  if (maxDownloads === 0) return;

  if (record.downloadCount >= maxDownloads) {
    record.expiresAt = Date.now();
    await cleanupRecord(token);
  }
}

export async function createZipStream(token: string) {
  const record = downloads.get(token);
  if (!record || record.status !== "completed" || record.files.length === 0) {
    return undefined;
  }

  const maxDownloads = appConfig.download.maxDownloadsPerFile;
  if (maxDownloads > 0 && record.downloadCount >= maxDownloads) {
    return undefined;
  }

  // Synchronous increment to prevent race conditions
  record.downloadCount++;
  record.updatedAt = Date.now();

  const zipPath = path.join(TEMP_DIR, `${token}-archive.zip`);

  // Check if zip already exists
  try {
    const { size } = await stat(zipPath);
    // If exists, return stream
    const stream = createReadStream(zipPath);
    return {
      stream,
      filename: `playlist-${token.slice(0, 8)}.zip`,
      size,
    };
  } catch {
    // Zip doesn't exist, create it
  }

  // Create ZIP
  return new Promise<
    | {
        stream: ReturnType<typeof createReadStream>;
        filename: string;
        size: number;
      }
    | undefined
  >((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });

    output.on("close", async () => {
      try {
        const size = (await stat(zipPath)).size;
        const readStream = createReadStream(zipPath);
        resolve({
          stream: readStream,
          filename: `playlist-${token.slice(0, 8)}.zip`,
          size,
        });
      } catch (err) {
        fail(err as Error);
      }
    });

    // Remove the partial ZIP so a later request can't serve it as finished
    const fail = (err: Error) => {
      record.downloadCount--;
      archive.abort();
      output.destroy();
      void rm(zipPath, { force: true }).catch(() => {});
      reject(err);
    };

    output.on("error", fail);
    archive.on("error", fail);

    archive.pipe(output);

    for (const file of record.files) {
      archive.file(file.filePath, { name: file.downloadName });
    }

    archive.finalize().catch(fail);
  });
}

export function createDownloadStream(token: string, fileIndex?: number) {
  const record = downloads.get(token);
  if (!record || record.status !== "completed" || record.files.length === 0) {
    return undefined;
  }

  const maxDownloads = appConfig.download.maxDownloadsPerFile;
  if (maxDownloads > 0 && record.downloadCount >= maxDownloads) {
    return undefined;
  }

  // Synchronous increment to prevent race conditions
  record.downloadCount++;
  record.updatedAt = Date.now();

  // If index provided, download specific file
  if (
    fileIndex !== undefined &&
    fileIndex >= 0 &&
    fileIndex < record.files.length
  ) {
    const file = record.files[fileIndex];
    const stream = createReadStream(file.filePath);

    return {
      stream,
      filename: file.downloadName,
      size: file.fileSize,
    };
  }

  // Default: Return first file (backward compatibility)
  const file = record.files[0];
  const stream = createReadStream(file.filePath);
  return {
    stream,
    filename: file.downloadName,
    size: file.fileSize,
  };
}
