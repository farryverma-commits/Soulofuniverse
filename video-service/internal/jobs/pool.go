package jobs

import (
	"context"
	"sync"
)

// Handler processes one queued job.
type Handler func(ctx context.Context, j *Job)

// Pool is a fixed-size worker pool fed by a queue channel.
type Pool struct {
	queue   chan *Job
	handler Handler
	wg      sync.WaitGroup
}

// NewPool starts size workers draining the queue.
func NewPool(size int, handler Handler) *Pool {
	p := &Pool{queue: make(chan *Job, size*4), handler: handler}
	p.wg.Add(size)
	for range size {
		go func() {
			defer p.wg.Done()
			for j := range p.queue {
				p.handler(context.Background(), j)
			}
		}()
	}
	return p
}

// Submit enqueues a job; returns false when the queue is full.
func (p *Pool) Submit(j *Job) bool {
	select {
	case p.queue <- j:
		return true
	default:
		return false
	}
}

// Shutdown closes the queue and waits for in-flight jobs to finish.
func (p *Pool) Shutdown() {
	close(p.queue)
	p.wg.Wait()
}
