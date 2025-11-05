FROM node:20-bookworm

# Install ffmpeg and dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp from official source
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

RUN corepack enable

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json astro.config.mjs ./
COPY server ./server
COPY src ./src

RUN pnpm build
RUN pnpm prune --prod

RUN rm -rf temp && mkdir -p temp

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "./dist/server/entry.mjs"]
