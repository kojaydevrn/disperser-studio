# Step 1: Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Step 2: Runtime Stage
FROM node:20-slim

WORKDIR /app

# Install FFmpeg, Python, curl, and ca-certificates
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (CRITICAL: required by yt-dlp for solving YouTube n-challenge)
RUN curl -fsSL https://deno.land/install.sh | sh \
    && ln -sf /root/.deno/bin/deno /usr/local/bin/deno \
    && deno --version

# Install yt-dlp nightly (latest patches for YouTube compatibility)
RUN pip3 install --no-cache-dir --upgrade "yt-dlp[default]" --break-system-packages \
    && yt-dlp --version

# Install bgutil PO Token provider plugin (auto-generates PO tokens for YouTube)
RUN pip3 install --no-cache-dir bgutil-ytdlp-pot-provider --break-system-packages || true

# Ensure yt-dlp can find Node.js for n-challenge solving
RUN ln -sf $(which node) /usr/local/bin/node || true

# Copy production dependencies from builder
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Env variables
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV DENO_DIR=/root/.deno
ENV PATH="/root/.deno/bin:${PATH}"
ENV PORT=5001
ENV NODE_ENV=production

EXPOSE 5001

CMD ["node", "dist/index.js"]
