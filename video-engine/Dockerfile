FROM python:3.11-slim

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

# Create non-root user matching host UID
ARG UID=1001
ARG GID=1001

RUN groupadd -g $GID appgroup && \
    useradd -u $UID -g appgroup -m appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

USER appuser

# Environment defaults
ENV BASE_DIR=/videos
ENV WATCH_DIR=/videos/input
ENV OUTPUT_DIR=/videos/processed
ENV LOG_DIR=/videos/logs
ENV ERROR_DIR=/videos/errors

CMD ["python", "src/engine.py"]
