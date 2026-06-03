# Use a specific minor version for reproducibility
FROM python:3.13.13-slim

# Set critical Python environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install runtime dependencies and clean up in a single layer to minimize size
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user matching host UID/GID (Default to 1001)
ARG UID=1001
ARG GID=1001

RUN groupadd -g $GID appgroup && \
    useradd -u $UID -g appgroup -m -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Upgrade pip and install requirements (leveraging Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Environment defaults (Match your engine's expectations)
ENV BASE_DIR=/videos \
    WATCH_DIR=/videos/input \
    OUTPUT_DIR=/videos/hls \
    LOG_DIR=/videos/logs \
    ERROR_DIR=/videos/errors

# Pre-create standard volumes with correct permissions before switching users
RUN mkdir -p $BASE_DIR $WATCH_DIR $OUTPUT_DIR $LOG_DIR $ERROR_DIR && \
    chown -R appuser:appgroup /app $BASE_DIR

# Copy application source code
COPY . .

# Switch to non-root user
USER appuser

# Use absolute path for safety
CMD ["python", "/app/src/engine.py"]