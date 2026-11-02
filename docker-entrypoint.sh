#!/bin/sh
set -e

# Started as root: give the node user the bind-mounted temp dir, then
# re-run this script as node so updates and the server never run as root.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/temp
  export HOME=/home/node
  exec su-exec node "$0" "$@"
fi

if [ "$UPDATER_ENABLED" = "false" ] || [ "$UPDATER_ENABLED" = "0" ]; then
  echo "[amia] Updates disabled. Starting server..."
  exec "$@"
fi

echo "[amia] Updating yt-dlp..."
yt-dlp -U 2>&1 || echo "[amia] yt-dlp update failed (non-fatal)"

echo "[amia] Updating SomeDL..."
pip install --upgrade somedl -q 2>&1 || echo "[amia] SomeDL update failed (non-fatal)"

echo "[amia] Updates complete. Starting server..."
exec "$@"
