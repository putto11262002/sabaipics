# =============================================================================
# SabaiFace Dockerfile (Flat Repo)
# =============================================================================
# Build: docker build --platform linux/amd64 -t sabaiface -f src/sabaiface/Dockerfile .
# Run:   docker run -p 8086:8086 --env-file src/sabaiface/.env sabaiface

# =============================================================================
# Stage 1: Builder - Install dependencies
# =============================================================================
FROM node:20-bookworm AS builder

# Install build dependencies for native modules (canvas, tensorflow)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml ./

# Skip model download during install
ENV SKIP_MODEL_DOWNLOAD=1

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source files needed at runtime
COPY src/sabaiface/ src/sabaiface/
COPY src/db/ src/db/
COPY tsconfig.json tsconfig.node.json ./

# =============================================================================
# Stage 2: Runtime - Minimal production image
# =============================================================================
FROM node:20-bookworm-slim AS runtime

# Install ONLY runtime libraries (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules and source from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/sabaiface ./src/sabaiface
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.node.json ./tsconfig.node.json
COPY --from=builder /app/package.json ./package.json

# Copy models (pre-downloaded, baked into image for fast cold start)
COPY src/sabaiface/models ./models

# TensorFlow native library path
ENV LD_LIBRARY_PATH=/app/node_modules/@tensorflow/tfjs-node/deps/lib

# Environment
ENV NODE_ENV=production
ENV PORT=8086
ENV MODELS_PATH=./models

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://localhost:8086/health').then(r => process.exit(r.ok ? 0 : 1))"

EXPOSE 8086

# Start server using tsx (TypeScript loader)
CMD ["node", "--import", "tsx", "src/sabaiface/src/server.ts"]
