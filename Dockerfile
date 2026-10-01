# Dockerfile
FROM node:20-alpine

# Install ffmpeg, python (for yt-dlp/SomeDL) and su-exec (to drop root in the entrypoint)
RUN apk add --no-cache ffmpeg python3 curl su-exec

# yt-dlp and SomeDL live in directories owned by the unprivileged `node` user,
# so the server can keep them updated without running as root
ENV PATH="/opt/yt-dlp:/opt/somedl/bin:$PATH"
RUN mkdir -p /opt/yt-dlp \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /opt/yt-dlp/yt-dlp \
    && chmod a+rx /opt/yt-dlp/yt-dlp \
    && python3 -m venv /opt/somedl \
    && /opt/somedl/bin/pip install --no-cache-dir somedl \
    && chown -R node:node /opt/yt-dlp /opt/somedl

# Copy custom SomeDL configuration
COPY --chown=node:node server/somedl_config.toml /home/node/.config/SomeDL/somedl_config.toml

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy and install deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy app
COPY . .

# Make entrypoint executable
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create temp dir
RUN mkdir -p temp && chown node:node temp

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
# Run tsx directly: pnpm (via corepack) would try to re-download itself for the node user
CMD ["node_modules/.bin/tsx", "server/index.ts"]
