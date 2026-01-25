# =============================================================================
# SabaiFace Dockerfile (Optimized Multi-Stage with pnpm deploy)
# =============================================================================
# Uses pnpm deploy to create isolated package from monorepo
# 
# Build: docker build --platform linux/amd64 -t sabaiface -f apps/sabaiface/Dockerfile .
# Run:   docker run -p 8086:8086 --env-file apps/sabaiface/.env sabaiface
#
# Expected size: ~1.5-1.8GB (down from 3.66GB)

# =============================================================================
# Stage 1: Builder - Install dependencies and create deployable package
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

# Enable pnpm (v10+ required for deploy --legacy flag)
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

# Copy workspace configuration files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY .npmrc* ./

# Enable inject-workspace-packages for pnpm deploy (required for deploy command)
RUN echo "inject-workspace-packages=true" >> .npmrc

# Copy all package.json files for dependency resolution
COPY packages/db/package.json ./packages/db/
COPY apps/sabaiface/package.json ./apps/sabaiface/

# Copy workspace packages source (needed for pnpm deploy)
COPY packages/db ./packages/db
COPY apps/sabaiface ./apps/sabaiface

# Skip model download during install (we'll copy models separately)
ENV SKIP_MODEL_DOWNLOAD=1

# Install all dependencies (including devDependencies for tsx)
RUN pnpm install --frozen-lockfile

# Deploy sabaiface with ALL dependencies (need tsx for runtime)
# inject-workspace-packages=true is set in .npmrc for deploy to work
# Note: Not using --prod because we need tsx to run TypeScript
RUN pnpm --filter=@sabaipics/face-recognition deploy /deployed

# Prune unnecessary files from deployed node_modules to save space
# Keep .d.ts files for TypeScript, remove source .ts files
RUN rm -rf \
    /deployed/node_modules/@tensorflow/tfjs-node/deps/lib/*.a \
    /deployed/node_modules/@tensorflow/tfjs-node/src \
    /deployed/node_modules/@tensorflow/tfjs-node/scripts \
    /deployed/node_modules/@tensorflow/tfjs/dist/*.map \
    /deployed/node_modules/.cache \
    && find /deployed/node_modules -name "*.md" -type f -delete 2>/dev/null || true \
    && find /deployed/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true \
    && find /deployed/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true \
    && find /deployed/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true \
    && find /deployed/node_modules -type d -name "example" -exec rm -rf {} + 2>/dev/null || true \
    && find /deployed/node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true

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

# Copy the deployed package (includes node_modules with all deps)
COPY --from=builder /deployed ./

# Copy models (pre-downloaded, baked into image for fast cold start)
COPY apps/sabaiface/models ./models

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
CMD ["node", "--import", "tsx", "src/server.ts"]
