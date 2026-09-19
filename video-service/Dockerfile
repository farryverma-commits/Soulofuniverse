# Build the static binary
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/video-service ./cmd/server

# Runtime: ffmpeg (includes ffprobe) + non-root user, mirroring video-engine
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG UID=1001
ARG GID=1001
RUN groupadd -g $GID appgroup && \
    useradd -u $UID -g appgroup -m -s /bin/bash appuser

ENV BASE_DIR=/videos \
    STAGING_DIR=/videos/staging \
    OUTPUT_DIR=/videos/hls \
    LOG_DIR=/videos/logs \
    ERROR_DIR=/videos/errors \
    PORT=8080

RUN mkdir -p $BASE_DIR $STAGING_DIR $OUTPUT_DIR $LOG_DIR $ERROR_DIR && \
    chown -R appuser:appgroup $BASE_DIR

COPY --from=build /out/video-service /usr/local/bin/video-service

USER appuser
EXPOSE 8080
CMD ["video-service"]
