// Package apierror defines the service-wide typed error envelope.
// Every API failure responds {code, message, error_id, job_id?} so the admin
// UI can render progress states, toasts and "view logs" actions, and every
// error_id correlates to slog fields plus LOG_DIR/{job_id}.log.
package apierror

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// Code is a stable machine-readable error identifier.
type Code string

const (
	CodeValidationFailed      Code = "validation_failed"
	CodeUnauthorized          Code = "unauthorized"
	CodeForbidden             Code = "forbidden"
	CodeNotFound              Code = "not_found"
	CodeConflictActiveJob     Code = "conflict_active_job"
	CodeConflictState         Code = "conflict_state"
	CodeTranscodeFailed       Code = "transcode_failed"
	CodeDependencyUnavailable Code = "dependency_unavailable"
	CodeInternal              Code = "internal"
)

func statusFor(c Code) int {
	switch c {
	case CodeValidationFailed:
		return http.StatusBadRequest
	case CodeUnauthorized:
		return http.StatusUnauthorized
	case CodeForbidden:
		return http.StatusForbidden
	case CodeNotFound:
		return http.StatusNotFound
	case CodeConflictActiveJob, CodeConflictState:
		return http.StatusConflict
	case CodeTranscodeFailed:
		return http.StatusUnprocessableEntity
	case CodeDependencyUnavailable:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

// Error is a typed service error with a correlation id.
type Error struct {
	Code    Code   `json:"code"`
	Message string `json:"message"`
	ErrorID string `json:"error_id"`
	JobID   string `json:"job_id,omitempty"`

	status int
}

// New creates an Error with a fresh correlation id.
func New(code Code, message string) *Error {
	return &Error{Code: code, Message: message, ErrorID: uuid.NewString()[:8], status: statusFor(code)}
}

// WithJob attaches the error to a transcode job.
func (e *Error) WithJob(jobID string) *Error {
	e.JobID = jobID
	return e
}

func (e *Error) Error() string {
	return string(e.Code) + ": " + e.Message + " (" + e.ErrorID + ")"
}

// Status is the HTTP status this error maps to.
func (e *Error) Status() int { return e.status }

// Write renders the error envelope as JSON.
func (e *Error) Write(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.status)
	_ = json.NewEncoder(w).Encode(e)
}

// Write is a one-shot helper: build and render.
func Write(w http.ResponseWriter, code Code, message string) *Error {
	e := New(code, message)
	e.Write(w)
	return e
}
