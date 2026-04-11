import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { appConfig } from "./config.js";
import { getTranslations } from "./i18n.js";
import {
  startDownload,
  getDownloadStatus,
  createDownloadStream,
  createZipStream,
  getDownload,
} from "./downloadManager.js";
import { checkRateLimit } from "./rateLimiter.js";
import { getClientIp, json } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const t = getTranslations(appConfig.language);

const app = express();
const PORT = process.env.PORT ?? 3000;

// Trust proxy — must be set before any route/middleware that reads req.ip
if (appConfig.trustProxy) {
  app.set("trust proxy", 1);
}

// Security headers — disable X-Powered-By and set sensible defaults
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Error handling middleware
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Config endpoint for frontend
app.get("/api/config", (req, res) => {
  res.json({
    language: appConfig.language,
    rateLimit: {
      maxRequests: appConfig.rateLimit.maxRequests,
      windowMinutes: appConfig.rateLimit.windowMinutes,
    },
    download: {
      ttlMinutes: appConfig.download.ttlMinutes,
      maxFileSizeMb: appConfig.download.maxFileSizeMb,
    },
    translations: {
      // Only send necessary translations to frontend
      pageTitle: t.pageTitle,
      pageSubtitle: t.pageSubtitle,
      urlLabel: t.urlLabel,
      urlPlaceholder: t.urlPlaceholder,
      formatLabel: t.formatLabel,
      qualityLabel: t.qualityLabel,
      playlistLabel: t.playlistLabel,
      downloadButton: t.downloadButton,
      formatMp4: t.formatMp4,
      formatWebm: t.formatWebm,
      formatMp3: t.formatMp3,
      formatWav: t.formatWav,
      qualityBest: t.qualityBest,
      quality1080p: t.quality1080p,
      quality720p: t.quality720p,
      quality480p: t.quality480p,
      qualityAudio: t.qualityAudio,
      statusInitiating: t.statusInitiating,
      statusDownloading: t.statusDownloading,
      statusReady: t.statusReady,
      downloadLinkText: t.downloadLinkText,
      downloadZip: t.downloadZip,
      playlistContent: t.playlistContent,
      errorGeneric: t.errorGeneric,
      errorStateUnavailable: t.errorStateUnavailable,
      errorCouldNotStart: t.errorCouldNotStart,
      platformsTitle: t.platformsTitle,
      platformsMore: t.platformsMore,
      noteRateLimit: t.noteRateLimit(
        appConfig.rateLimit.maxRequests,
        formatWindow(appConfig.rateLimit.windowMinutes),
      ),
      noteCleanup: t.noteCleanup(formatMinutes(appConfig.download.ttlMinutes)),
      noteMaxSize: t.noteMaxSize(appConfig.download.maxFileSizeMb),
      notePrivacy: t.notePrivacy,
      timeHour: t.timeHour,
      timeHours: t.timeHours,
      timeMinute: t.timeMinute,
      timeMinutes: t.timeMinutes,
    },
  });
});

// Helper functions for formatting
function formatWindow(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? t.timeHour : t.timeHours}`;
  }
  return `${minutes} ${t.timeMinutes}`;
}

function formatMinutes(minutes: number) {
  if (minutes === 1) return `1 ${t.timeMinute}`;
  return `${minutes} ${t.timeMinutes}`;
}

// Download schema
const PayloadSchema = z
  .object({
    url: z.string().url(),
    format: z.enum(["mp4", "webm", "mp3", "wav"]).default("mp4"),
    quality: z.enum(["best", "1080p", "720p", "480p", "audio"]).default("best"),
    playlist: z.boolean().default(false),
  })
  .transform((value) => {
    let quality = value.quality;

    if (value.format === "mp3" || value.format === "wav") {
      quality = "audio";
    } else if (quality === "audio") {
      quality = "best";
    }

    return {
      url: value.url,
      format: value.format,
      quality,
      playlist: value.playlist,
    };
  });

function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets e.g. [::1]
  const host = hostname.replace(/^\[|\]$/g, "");

  // Block known internal hostnames
  const blockedHostnames = ["localhost", "ip6-localhost", "ip6-loopback"];
  if (blockedHostnames.includes(host.toLowerCase())) return true;

  // Block internal TLDs
  if (/\.(local|internal|localhost|intranet|lan)$/i.test(host)) return true;

  // Block IPv4 private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 || // 0.x.x.x      — this network
      a === 10 || // 10.x.x.x     — private
      a === 127 || // 127.x.x.x    — loopback
      (a === 169 && b === 254) || // 169.254.x.x  — link-local (AWS metadata)
      (a === 172 && b >= 16 && b <= 31) || // 172.16–31.x  — private
      (a === 192 && b === 168) || // 192.168.x.x  — private
      (a === 192 && b === 0 && Number(ipv4[3]) === 0) || // 192.0.0.x   — IETF protocol
      (a === 100 && b >= 64 && b <= 127) || // 100.64–127.x — CGNAT
      (a === 198 && (b === 18 || b === 19)) || // 198.18–19.x  — benchmarking
      a >= 224 // 224.x.x.x+   — multicast/reserved
    )
      return true;
  }

  // Block IPv6 private/reserved ranges
  const h = host.toLowerCase();
  if (
    h === "::" || // unspecified
    h === "::1" || // loopback
    h.startsWith("::ffff:") || // IPv4-mapped
    h.startsWith("fc") || // unique local fc00::/7
    h.startsWith("fd") || // unique local fd00::/8
    h.startsWith("fe80") || // link-local fe80::/10
    h.startsWith("2001:db8") // documentation
  )
    return true;

  return false;
}

async function isValidUrl(candidate: string): Promise<boolean> {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;

    // First pass: block obvious private hostnames/IPs before touching the network
    if (isPrivateIp(parsed.hostname)) return false;

    // Second pass: resolve DNS and check every returned address.
    // This closes the DNS-rebinding vector and makes redirect-chain attacks
    // much harder — the hostname must resolve to a public IP right now.
    try {
      const addresses = await lookup(parsed.hostname, { all: true });
      for (const { address } of addresses) {
        if (isPrivateIp(address)) return false;
      }
    } catch {
      // If the hostname can't be resolved at all, fail closed.
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// POST /api/download - Start a new download
app.post(
  "/api/download",
  asyncHandler(async (req, res) => {
    let payload: z.infer<typeof PayloadSchema>;

    try {
      payload = PayloadSchema.parse(req.body);
    } catch (error) {
      res.status(400).json({
        error: t.apiInvalidData,
        details:
          error instanceof z.ZodError ? error.issues : t.apiInvalidDataDetails,
      });
      return;
    }

    if (!(await isValidUrl(payload.url))) {
      res.status(400).json({ error: t.apiInvalidUrl });
      return;
    }

    const ip = getClientIp(req);
    const allowed = checkRateLimit(ip);

    if (!allowed) {
      res.status(429).json({
        error: t.apiRateLimitExceeded(
          appConfig.rateLimit.maxRequests,
          formatWindow(appConfig.rateLimit.windowMinutes),
        ),
      });
      return;
    }

    try {
      const { token } = await startDownload(
        payload.url,
        payload.format,
        payload.quality,
        payload.playlist,
      );
      res.status(202).json({
        token,
        status: "in_progress",
      });
    } catch (error) {
      console.error(
        "[download] failed to start:",
        error instanceof Error ? error.message : error,
      );
      res.status(500).json({
        error: t.apiCouldNotStart,
      });
    }
  }),
);

// GET /api/status/:token - Check download status
app.get("/api/status/:token", (req, res) => {
  const token = req.params.token;

  if (!token) {
    res.status(400).json({ error: t.apiInvalidData });
    return;
  }

  const status = getDownloadStatus(token);

  if (!status) {
    res.status(404).json({ error: t.apiNotFound });
    return;
  }

  res.json(status);
});

// GET /api/download/:token - Download the file
app.get(
  "/api/download/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const mode = req.query.mode as string | undefined;
    const indexParam = req.query.index as string | undefined;

    if (!token) {
      res.status(400).json({ error: "Token required." });
      return;
    }

    const record = getDownload(token);

    if (!record) {
      res.status(404).json({ error: t.apiNotFound });
      return;
    }

    if (record.status === "error") {
      console.error(`[download:${token}] serving error state:`, record.error);
      res.status(410).json({
        error: t.apiInternalError,
      });
      return;
    }

    if (record.status !== "completed") {
      res.status(409).json({ error: t.apiFileNotReady });
      return;
    }

    const MIME_MAP: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      opus: "audio/ogg",
      zip: "application/zip",
    };

    function sanitizeFilename(name: string) {
      return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    }

    let download;
    if (mode === "zip") {
      download = await createZipStream(token);
    } else {
      const index = indexParam ? parseInt(indexParam, 10) : undefined;
      download = createDownloadStream(token, index);
    }

    if (!download) {
      res.status(404).json({ error: t.apiNotFound });
      return;
    }

    const ext = path.extname(download.filename).replace(".", "").toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";
    const filename = sanitizeFilename(download.filename);

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });

    if (download.size) {
      res.set("Content-Length", download.size.toString());
    }

    (download.stream as any).pipe(res);
  }),
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: t.apiInternalError });
});

app.listen(PORT, () => {
  console.log(`Amia server running on port ${PORT}`);
  console.log(`Language: ${appConfig.language}`);
  console.log(`Temp directory: ${appConfig.download.tempDir}`);
  console.log(
    `Trust proxy: ${appConfig.trustProxy ? "enabled (1 hop)" : "disabled"}`,
  );
});
