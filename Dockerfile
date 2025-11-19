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

# Build stage: Install node dependencies and build the app
FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm prune --prod

# Runtime stage: Copy only necessary files
FROM base AS runtime
WORKDIR /app

# Copy built artifacts and dependencies from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./

# Create temp directory for downloads
RUN mkdir -p temp && chown node:node temp

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Use entrypoint script to handle permissions and user switching
ENTRYPOINT ["/app/server/entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
