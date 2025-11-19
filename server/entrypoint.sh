#!/bin/sh
set -e

# Fix permissions for temp directory
# This runs as root before switching user
if [ -d "/app/temp" ]; then
  chown -R node:node /app/temp
fi

# Execute the command as node user
exec su-exec node "$@"
