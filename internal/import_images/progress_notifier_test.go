package import_images

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProgressNotifier_Run(t *testing.T) {
	t.Run("calls callback on done", func(t *testing.T) {
		notifier := NewProgressNotifier()
		notifier.addSuccess()
		notifier.addSuccess()
		notifier.addFailure("/path/to/failed", assert.AnError)

		var callCount int64
		done := make(chan struct{})
		finished := make(chan struct{})

		go func() {
			notifier.Run(done, func() {
				atomic.AddInt64(&callCount, 1)
			})
			close(finished)
		}()

		// Close done immediately - the callback should still be called at least once
		close(done)

		select {
		case <-finished:
			// Run returned
		case <-time.After(5 * time.Second):
			t.Fatal("Run did not return within 5 seconds")
		}

		count := atomic.LoadInt64(&callCount)
		require.GreaterOrEqual(t, count, int64(1), "callback should be called at least once")
	})

	t.Run("calls callback periodically until done", func(t *testing.T) {
		notifier := NewProgressNotifier()

		var callCount int64
		done := make(chan struct{})
		finished := make(chan struct{})

		go func() {
			notifier.Run(done, func() {
				atomic.AddInt64(&callCount, 1)
			})
			close(finished)
		}()

		// Wait for the ticker to fire at least once (Run uses 1 second timer)
		time.Sleep(1500 * time.Millisecond)
		close(done)

		select {
		case <-finished:
			// Run returned
		case <-time.After(5 * time.Second):
			t.Fatal("Run did not return within 5 seconds")
		}

		count := atomic.LoadInt64(&callCount)
		// Should have been called at least twice: once from timer, once from done
		require.GreaterOrEqual(t, count, int64(2), "callback should be called at least twice (timer + done)")
	})

	t.Run("callback sees updated notifier state", func(t *testing.T) {
		notifier := NewProgressNotifier()
		done := make(chan struct{})
		finished := make(chan struct{})

		var lastCompleted int
		var lastFailed int

		go func() {
			notifier.Run(done, func() {
				lastCompleted = notifier.Completed
				lastFailed = notifier.Failed
			})
			close(finished)
		}()

		notifier.addSuccess()
		notifier.addSuccess()
		notifier.addFailure("/some/path", assert.AnError)

		close(done)

		select {
		case <-finished:
			// Run returned
		case <-time.After(5 * time.Second):
			t.Fatal("Run did not return within 5 seconds")
		}

		// After done, the final callback call should see the current state
		assert.Equal(t, 2, lastCompleted)
		assert.Equal(t, 1, lastFailed)
	})
}

func TestProgressNotifier_addSuccess(t *testing.T) {
	notifier := NewProgressNotifier()
	assert.Equal(t, 0, notifier.Completed)

	notifier.addSuccess()
	assert.Equal(t, 1, notifier.Completed)

	notifier.addSuccess()
	assert.Equal(t, 2, notifier.Completed)
}

func TestProgressNotifier_addFailure(t *testing.T) {
	notifier := NewProgressNotifier()
	assert.Equal(t, 0, notifier.Failed)
	assert.Empty(t, notifier.FailedPaths)
	assert.Empty(t, notifier.FailedErrors)

	err1 := assert.AnError
	notifier.addFailure("/path/1", err1)
	assert.Equal(t, 1, notifier.Failed)
	assert.Equal(t, []string{"/path/1"}, notifier.FailedPaths)
	assert.Equal(t, []error{err1}, notifier.FailedErrors)

	err2 := assert.AnError
	notifier.addFailure("/path/2", err2)
	assert.Equal(t, 2, notifier.Failed)
	assert.Equal(t, []string{"/path/1", "/path/2"}, notifier.FailedPaths)
	assert.Len(t, notifier.FailedErrors, 2)
}

func TestNewProgressNotifier(t *testing.T) {
	notifier := NewProgressNotifier()
	assert.NotNil(t, notifier)
	assert.Equal(t, 0, notifier.Completed)
	assert.Equal(t, 0, notifier.Failed)
	assert.NotNil(t, notifier.FailedPaths)
	assert.NotNil(t, notifier.FailedErrors)
	assert.Empty(t, notifier.FailedPaths)
	assert.Empty(t, notifier.FailedErrors)
}
