#!/bin/sh
set -e

echo "[amia] Updating yt-dlp..."
yt-dlp -U 2>&1 || echo "[amia] yt-dlp update failed (non-fatal)"

echo "[amia] Updating SomeDL..."
pip install --upgrade somedl --break-system-packages -q 2>&1 || echo "[amia] SomeDL update failed (non-fatal)"

echo "[amia] Updates complete. Starting server..."
exec "$@"
