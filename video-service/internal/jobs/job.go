// Package jobs tracks transcode job state in memory and broadcasts progress
// to SSE subscribers. The DB row (videos.metadata.job) is the durable mirror
// so a UI refresh or reconnect never loses live state.
package jobs

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Stage values for a job lifecycle.
const (
	StageQueued      = "queued"
	StageUploading   = "uploading"
	StageThumbnail   = "thumbnail"
	StageTranscoding = "transcoding"
	StageFinalizing  = "finalizing"
	StageDone        = "done"
	StageFailed      = "failed"
)

// JobErr is a terminal failure attached to a job.
type JobErr struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	ErrorID string `json:"error_id"`
}

// Job is one transcode unit of work.
type Job struct {
	ID         string    `json:"id"`
	VideoID    string    `json:"video_id"`
	Slug       string    `json:"slug"`
	Filename   string    `json:"filename"`
	StagedPath string    `json:"-"`
	Stage      string    `json:"stage"`
	Progress   int       `json:"progress"`
	Error      *JobErr   `json:"error,omitempty"`
	UpdatedAt  time.Time `json:"updated_at"`

	mu   sync.Mutex
	subs map[string]chan Snapshot
}

// Snapshot is a copy of the public job state safe to serialize.
type Snapshot struct {
	ID        string    `json:"id"`
	VideoID   string    `json:"video_id"`
	Slug      string    `json:"slug"`
	Stage     string    `json:"stage"`
	Progress  int       `json:"progress"`
	Error     *JobErr   `json:"error,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (j *Job) snapshotLocked() Snapshot {
	return Snapshot{
		ID: j.ID, VideoID: j.VideoID, Slug: j.Slug,
		Stage: j.Stage, Progress: j.Progress,
		Error: j.Error, UpdatedAt: j.UpdatedAt,
	}
}

// Snapshot returns a copy of the current public state.
func (j *Job) Snapshot() Snapshot {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.snapshotLocked()
}

func (j *Job) broadcastLocked() {
	snap := j.snapshotLocked()
	for _, ch := range j.subs {
		select {
		case ch <- snap:
		default:
		}
	}
}

// Update sets stage and progress, then notifies subscribers.
func (j *Job) Update(stage string, progress int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Stage = stage
	j.Progress = progress
	j.UpdatedAt = time.Now().UTC()
	j.broadcastLocked()
}

// Fail marks the job terminal with an error.
func (j *Job) Fail(code, message, errorID string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Stage = StageFailed
	j.Error = &JobErr{Code: code, Message: message, ErrorID: errorID}
	j.UpdatedAt = time.Now().UTC()
	j.broadcastLocked()
}

// Complete marks the job done at 100%.
func (j *Job) Complete() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Stage = StageDone
	j.Progress = 100
	j.UpdatedAt = time.Now().UTC()
	j.broadcastLocked()
}

// Terminal reports whether the job reached done or failed.
func (j *Job) Terminal() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.Stage == StageDone || j.Stage == StageFailed
}

// Subscribe returns a channel receiving snapshots on every update.
// Unsubscribe with the returned cancel func.
func (j *Job) Subscribe() (<-chan Snapshot, func()) {
	j.mu.Lock()
	defer j.mu.Unlock()
	id := uuid.NewString()
	ch := make(chan Snapshot, 16)
	if j.subs == nil {
		j.subs = make(map[string]chan Snapshot)
	}
	j.subs[id] = ch
	cur := j.snapshotLocked()
	select {
	case ch <- cur:
	default:
	}
	return ch, func() {
		j.mu.Lock()
		defer j.mu.Unlock()
		delete(j.subs, id)
	}
}

// Registry owns all jobs and the worker pool input.
type Registry struct {
	mu   sync.RWMutex
	jobs map[string]*Job
	// byVideo lets retry/status resolve a job from a video id.
	byVideo map[string]*Job
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{jobs: make(map[string]*Job), byVideo: make(map[string]*Job)}
}

// Create registers a new job in queued state.
func (r *Registry) Create(videoID, slug, filename, stagedPath string) *Job {
	j := &Job{
		ID: uuid.NewString()[:8], VideoID: videoID,
		Slug: slug, Filename: filename, StagedPath: stagedPath,
		Stage: StageQueued, UpdatedAt: time.Now().UTC(),
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.jobs[j.ID] = j
	r.byVideo[videoID] = j
	return j
}

// ByVideo returns the latest job for a video, if any.
func (r *Registry) ByVideo(videoID string) (*Job, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	j, ok := r.byVideo[videoID]
	return j, ok
}

// ByID returns a job by its job id.
func (r *Registry) ByID(id string) (*Job, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	j, ok := r.jobs[id]
	return j, ok
}
