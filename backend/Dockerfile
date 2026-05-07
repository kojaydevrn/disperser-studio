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

# Install FFmpeg, Python, and curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Copy production dependencies from builder
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Env variables
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV PORT=5001
ENV NODE_ENV=production

EXPOSE 5001

CMD ["node", "dist/index.js"]
