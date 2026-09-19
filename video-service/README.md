# video-service

Go replacement for `video-engine/` (Python watchdog + ffmpeg). Admin-only HTTP
service that owns the VOD lifecycle: upload → HLS transcode → review →
publish, with live job progress and typed errors.

Public library reads stay on the existing Supabase RLS `published` path; this
service never serves video files. HLS output in `OUTPUT_DIR/{id}/` is served by
the external static server behind `BASE_URL`.

## Run

```bash
cp .env.example .env   # fill SUPABASE_URL / SUPABASE_KEY / BASE_URL
set -a; source .env; set +a
go run ./cmd/server
```

Docker (mirrors `video-engine` volumes, staging replaces input):

```bash
docker build -t video-service .
docker run -d --restart unless-stopped --env-file .env \
  -v /mnt/videos/staging:/videos/staging \
  -v /mnt/videos/hls:/videos/hls \
  -v /mnt/videos/logs:/videos/logs \
  -v /mnt/videos/errors:/videos/errors \
  -p 8080:8080 video-service
```

## API (all `/api/v1/videos/*` require an admin JWT)

| Method | Path | Notes |
|---|---|---|
| POST | `/videos/upload` | multipart `file`; `202 {id,slug,status,job}` |
| GET | `/videos?status=&limit=` | admin review queue, newest first |
| GET | `/videos/:id` | row + live job (`job` from registry when active) |
| GET | `/videos/:id/events` | SSE progress stream; poll `GET :id` as fallback |
| GET | `/videos/:id/logs?tail=200` | per-job ffmpeg log tail |
| POST | `/videos/:id/process` | retry failed/stalled; `409` if active |
| PATCH | `/videos/:id/publish` | `under_review → published` |
| PATCH | `/videos/:id/unpublish` | `published → under_review` |
| DELETE | `/videos/:id` | removes HLS output + row; `409` if job active |
| GET | `/healthz`, `/readyz` | unauthenticated |

Every request needs `Authorization: Bearer <supabase JWT>` for an approved
admin (`profiles.role=admin`, `status=approved`); else `401`/`403`. Errors are
`{code, message, error_id, job_id?}` where `error_id` correlates to slog output
and `LOG_DIR/{video-id}.log`.

```bash
TOKEN=$(supabase-auth-jwt-for-admin)
curl -X POST localhost:8080/api/v1/videos/upload \
  -H "Authorization: Bearer $TOKEN" -F file=@talk.mp4
curl -N -H "Authorization: Bearer $TOKEN" \
  localhost:8080/api/v1/videos/<id>/events
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  localhost:8080/api/v1/videos/<id>/publish
```

## Job progress

`job = {stage, progress, error?}` with stages
`queued|uploading|thumbnail|transcoding|finalizing|done|failed`, mirrored into
`videos.metadata.job` (1s throttle) so refresh/poll/SSE reconnects agree.

## Dev

```bash
go build ./... && go vet ./... && go test ./... && gofmt -l .
```
