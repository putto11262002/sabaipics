# Use official Python slim image (smaller footprint)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (OpenCV + glib for threading)
RUN apt-get update && apt-get install -y \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for better caching)
COPY pyproject.toml ./

# Install uv for faster dependency installation
RUN pip install --no-cache-dir uv

# Install dependencies
RUN uv pip install --system \
    deepface>=0.0.97 \
    fastapi>=0.128.0 \
    python-multipart>=0.0.21 \
    tf-keras>=2.20.1 \
    uvicorn>=0.40.0

# Copy application code
COPY main.py ./

# Expose port
EXPOSE 8087

# Set environment variables
ENV PORT=8087
ENV MODEL_NAME=ArcFace
ENV DETECTOR_BACKEND=retinaface
ENV MIN_CONFIDENCE=0.5
ENV MAX_FACES_PER_IMAGE=100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8087/health', timeout=5).read()"

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8087"]
