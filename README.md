# Amia

<p align="center"><a href="https://dl.ruginit.xyz" title="Amia"><img src="public/images/amia.png" alt="Amia" width="30%"></a></p>

Simple self-hosted video downloader with a web UI. Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Why "Amia"?

Amia is the online alias of [Mizuki Akiyama](https://www.sekaipedia.org/wiki/Akiyama_Mizuki) from Project Sekai's [Niigo group](https://www.sekaipedia.org/wiki/25-ji,_Nightcord_de.). Mizuki is a video editor, and just like how she work with videos, this tool help you download and manage videos from the internet!

<p><a href="https://youtu.be/yzNM3-tq8vQ" title="Amia"><img src="public/images/mizu5.png" alt="Amia"></a></p>

## Features

- 🎬 Download from 1000+ sites (YouTube, TikTok, Twitter/X, etc.)
- 🌍 Multi-language (English / Spanish)
- 📦 Playlist support (optional, ZIP download)
- 🔒 Private downloads (UUID tokens, no database)
- 🐳 Docker ready

## Quick Start

```bash
# Clone
git clone https://github.com/Multex/amia.git
cd amia

# Config
cp .env.example .env
# Edit .env to your liking

# Run with Docker
docker compose up -d
```

Access at `http://localhost:3000`

## Updating

```bash
git pull
docker compose restart
```

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `LANGUAGE` | `en` | UI language (`en` or `es`) |
| `DOWNLOAD_TTL_MINUTES` | `15` | How long files stay after download |
| `DOWNLOAD_CLEANUP_INTERVAL_MINUTES` | `5` | How often to clean expired files |
| `DOWNLOAD_MAX_FILE_SIZE_MB` | `500` | Max file size in MB |
| `DOWNLOAD_MAX_DOWNLOADS_PER_FILE` | `1` | Downloads before auto-delete (0 = unlimited) |
| `DOWNLOAD_TEMP_DIR` | `temp` | Where to store temporary files |
| `DOWNLOAD_MAX_PLAYLIST_ITEMS` | `5` | Max videos from a playlist |
| `DOWNLOAD_RATE_LIMIT_MAX` | `5` | Max downloads per IP in time window |
| `DOWNLOAD_RATE_LIMIT_WINDOW_MINUTES` | `60` | Rate limit time window in minutes |

See `.env.example` for detailed comments on each variable.

## Stack

- **Backend**: Express + TypeScript (tsx)
- **Frontend**: Vanilla HTML/CSS/JS
- **Downloader**: yt-dlp + ffmpeg

## Reverse Proxy

Put behind Nginx, Caddy, or Cloudflare Tunnel:

```
http://localhost:8085 -> https://your-domain.com
```

## License

MIT License - See `LICENSE` file for details.

## Credits

Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) - A feature-rich command-line audio/video downloader
