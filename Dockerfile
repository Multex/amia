# Dockerfile
FROM node:20-alpine

# Install yt-dlp, ffmpeg, and SomeDL (required)
RUN apk add --no-cache ffmpeg python3 py3-pip curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && pip install somedl --break-system-packages

# Copy custom SomeDL configuration
COPY server/somedl_config.toml /root/.config/SomeDL/somedl_config.toml

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

# Create temp dir
RUN mkdir -p temp

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "start"]
