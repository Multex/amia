# Amia

<p align="center"><a href="https://dl.ruginit.xyz" title="Amia"><img src="public/images/amia.png" alt="Amia" width="30%"></a></p>

Simple self-hosted video downloader with web UI using yt-dlp.

## Features

- **1000+ platforms supported** via yt-dlp (YouTube, TikTok, Twitter/X, Instagram, Vimeo, etc.)
- **Multi-language support**: English (default) and Spanish
- **No database required**: Everything in memory and temporary filesystem
- **Private downloads**: Unique UUID tokens per download, no shared history
- **Configurable download limits**: Allow multiple downloads per file or single-use links
- **Rate limiting**: Configurable per-IP limits
- **Auto-cleanup**: Files automatically deleted after reaching download limit or TTL expiration
- **Docker ready**: Easy deployment with docker-compose

## Why "Amia"?

Amia is the online alias of [Mizuki Akiyama](https://www.sekaipedia.org/wiki/Akiyama_Mizuki) from Project Sekai's [Niigo group](https://www.sekaipedia.org/wiki/25-ji,_Nightcord_de.). Mizuki is a video editor, and just like how she work with videos, this tool help you download and manage videos from the internet!

<p><a href="https://youtu.be/yzNM3-tq8vQ" title="Amia"><img src="public/images/mizu5.png" alt="Amia"></a></p>

## Stack

- **Frontend**: Astro (SSR with Node adapter)
- **Backend**: Node.js + Astro API Routes
- **Downloader**: yt-dlp + ffmpeg
- **Deployment**: Docker + docker-compose

## Quick Start

> **Using Docker?** Skip requirements - just clone and run `docker compose up -d`

### Requirements (for local development only)

- Node.js 20+
- pnpm 8+
- yt-dlp and ffmpeg
"
### Development

```bash
# Install dependencies
pnpm install

# Optional: Create .env file
cp .env.example .env

# Start dev server
pnpm dev
# Opens at http://localhost:4321
```

### Production (without Docker)

```bash
pnpm install
pnpm build
pnpm start
# Server runs on port 3000
```

### Docker (Recommended)

```bash
# Start (builds automatically on first run)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

By default, the app will be available at `http://localhost:8085`

**That's it!** Docker will automatically:
- Install all dependencies
- Build the application
- Start the server

No need for Node.js, pnpm, or yt-dlp installed locally.

## Configuration

Amia is configured via environment variables. Create a `.env` file or set them in your environment.

### Available Variables

See `.env.example` for detailed comments on each variable.

| Variable | Description | Default | Valid Values |
|----------|-------------|---------|--------------|
| `LANGUAGE` | Interface language | `en` | `en`, `es` |
| `DOWNLOAD_TTL_MINUTES` | Minutes until file expires after completion | `15` | `1-∞` |
| `DOWNLOAD_CLEANUP_INTERVAL_MINUTES` | How often to clean expired files (minutes) | `5` | `1-∞` |
| `DOWNLOAD_MAX_FILE_SIZE_MB` | Maximum file size allowed (MB) | `500` | `1-∞` |
| `DOWNLOAD_MAX_DOWNLOADS_PER_FILE` | Times a file can be downloaded before deletion (0 = unlimited) | `1` | `0-∞` |
| `DOWNLOAD_TEMP_DIR` | Temporary storage directory | `temp` | Any valid path |
| `DOWNLOAD_RATE_LIMIT_MAX` | Max downloads per IP in time window | `5` | `1-∞` |
| `DOWNLOAD_RATE_LIMIT_WINDOW_MINUTES` | Rate limit time window (minutes) | `60` | `1-∞` |

### Language Support

Change the interface language by setting the `LANGUAGE` environment variable.

**In Docker**: Edit the `.env` file:
```bash
# Create .env if it doesn't exist
cp .env.example .env

# Edit and change LANGUAGE value
nano .env

# Restart to apply changes
docker compose restart
```

**Local development**: Set in `.env` file or export directly:
```bash
# In .env file
LANGUAGE=es

# Or export temporarily
export LANGUAGE=es
pnpm dev
```

## API

Base URL (development): `http://localhost:4321`
Base URL (production): `http://localhost:3000`

### Endpoints

#### POST `/api/download`
Start a new download.

**Request body (JSON)**:
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "format": "mp4",
  "quality": "best"
}
```

- `format`: `mp4`, `webm`, or `mp3`
- `quality`: `best`, `1080p`, `720p`, `480p`, or `audio`

**Response (202 Accepted)**:
```json
{
  "token": "uuid-token-here",
  "status": "in_progress"
}
```

#### GET `/api/status/:token`
Check download status.

**Response (200 OK)**:
```json
{
  "token": "uuid-token-here",
  "status": "completed",
  "progress": 100,
  "downloadName": "video_title.mp4",
  "fileSize": 12345678
}
```

Status can be: `in_progress`, `completed`, or `error`

#### GET `/api/download/:token`
Download the file. Increments the download counter for the file.

Files are automatically deleted after:
- Reaching the download limit (configured by `DOWNLOAD_MAX_DOWNLOADS_PER_FILE`)
- OR when the TTL expires (configured by `DOWNLOAD_TTL_MINUTES`)

**Response**: Binary file stream with appropriate content-type header.

### Example Usage

```bash
# Start download
TOKEN=$(curl -s -X POST http://localhost:3000/api/download \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ","format":"mp4","quality":"best"}' \
  | jq -r '.token')

# Check status
curl -s http://localhost:3000/api/status/$TOKEN | jq

# Download when ready
curl -L -o video.mp4 http://localhost:3000/api/download/$TOKEN
```

## Project Structure

```
.
├── src/
│   ├── pages/
│   │   ├── index.astro              # Main UI
│   │   └── api/
│   │       ├── download.ts          # POST /api/download
│   │       ├── download/[token].ts  # GET /api/download/:token
│   │       └── status/[token].ts    # GET /api/status/:token
│   └── api/
│       ├── _downloadManager.ts      # Download queue and cleanup
│       ├── _rateLimiter.ts          # Rate limiting logic
│       └── _utils.ts                # Utilities
├── server/
│   ├── ytdlp.js                     # yt-dlp wrapper
│   ├── config.js                    # Configuration loader
│   └── i18n.js                      # Translations
├── temp/                             # Temporary downloads (gitignored)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Docker Deployment Details

- Base image: `node:20-bookworm`
- Includes yt-dlp and ffmpeg
- Exposed port: 3000 (mapped to 127.0.0.1:8085 in compose)
- Volume: `./temp:/app/temp` for persistence between restarts
- Security: Runs with `cap_drop: [ALL]` and `no-new-privileges: true`

### Behind a Reverse Proxy

Recommended for production. Example with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8085
```

Or use Nginx, Caddy, Traefik, etc.

## Security Notes

- Each download generates a unique UUID token
- No history or metadata is shared between users
- Files are automatically deleted after reaching download limit or TTL expiration
- Rate limiting prevents abuse (configurable per-IP limits)
- Configurable file size limits
- Configurable download limits per file (prevent unlimited re-downloads or allow retry on failed downloads)
- **Important**: Respect terms of service and copyright when downloading content

## Troubleshooting

### "Rate limit exceeded" (429)
You've hit the IP rate limit. Wait for the time window to pass or increase `DOWNLOAD_RATE_LIMIT_MAX`.

### "File too large" error
The video exceeds `DOWNLOAD_MAX_FILE_SIZE_MB`. Increase the limit if needed.

### Dev server issues after changing .env
Restart the dev server: `Ctrl+C` and `pnpm dev` again.

### Downloads fail with "Unsupported URL"
The URL might not be supported by yt-dlp, or you might need to update yt-dlp.

**Docker users:**
```bash
# Rebuild the Docker image to get the latest yt-dlp version
docker compose down
docker compose build --no-cache
docker compose up -d
```

**Local development:**
```bash
# Update yt-dlp to latest version
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Verify version
yt-dlp --version
```

Note: Docker automatically downloads the latest yt-dlp version on each build.

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (with hot reload)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Clean build artifacts
pnpm run clean
```

## License

MIT License - See `LICENSE` file for details.

## Credits

Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) - A feature-rich command-line audio/video downloader
