# Base stage: Install system dependencies
FROM node:20-alpine AS base
# yt-dlp requires python3 and ffmpeg
# su-exec is needed for the entrypoint script to switch users
RUN apk add --no-cache ffmpeg python3 curl ca-certificates su-exec

# Install latest yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Production stage
FROM base AS production
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application files
COPY server ./server
COPY public ./public

# Create temp directory
RUN mkdir -p temp

# Create entrypoint script
RUN echo '#!/bin/sh\nset -e\n\n# Fix permissions for temp directory\nif [ -d "/app/temp" ]; then\n  chown -R node:node /app/temp\nfi\n\n# Execute the command as node user\nexec su-exec node "$@"' > /app/server/entrypoint.sh && chmod +x /app/server/entrypoint.sh

# Fix permissions
RUN chown -R node:node /app

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Use entrypoint script to handle permissions and user switching
ENTRYPOINT ["/app/server/entrypoint.sh"]
CMD ["pnpm", "start"]
