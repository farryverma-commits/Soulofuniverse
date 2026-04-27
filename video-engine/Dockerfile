FROM python:3.11-slim

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment defaults
ENV BASE_DIR=/videos
ENV WATCH_DIR=/videos/input
ENV OUTPUT_DIR=/videos/processed
ENV LOG_DIR=/videos/logs
ENV ERROR_DIR=/videos/errors

CMD ["python", "src/engine.py"]
