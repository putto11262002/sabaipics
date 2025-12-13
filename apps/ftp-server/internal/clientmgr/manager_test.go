package clientmgr

import (
	"testing"
	"time"
)

func TestNewManager(t *testing.T) {
	mgr := NewManager()
	if mgr == nil {
		t.Fatal("NewManager() returned nil")
	}
	if mgr.clients == nil {
		t.Error("clients map is nil")
	}
	if mgr.eventChan == nil {
		t.Error("eventChan is nil")
	}
}

func TestManager_StartStop(t *testing.T) {
	mgr := NewManager()
	mgr.Start()

	// Give the goroutine time to start
	time.Sleep(10 * time.Millisecond)

	// Stop should not block or panic
	mgr.Stop()
}

func TestManager_SendEvent_NonBlocking(t *testing.T) {
	mgr := NewManager()

	// Fill the buffer (100 events)
	for i := 0; i < 100; i++ {
		mgr.SendEvent(ClientEvent{
			Type:     EventUploadFailed,
			ClientID: uint32(i),
			Reason:   "test",
		})
	}

	// This should not block (drops event if full)
	done := make(chan bool)
	go func() {
		mgr.SendEvent(ClientEvent{
			Type:     EventUploadFailed,
			ClientID: 999,
			Reason:   "overflow",
		})
		done <- true
	}()

	select {
	case <-done:
		// Good, didn't block
	case <-time.After(100 * time.Millisecond):
		t.Error("SendEvent blocked when channel full")
	}
}

func TestEventType_Constants(t *testing.T) {
	// Ensure event types have distinct values
	types := []EventType{EventAuthExpired, EventUploadFailed, EventRateLimited}
	seen := make(map[EventType]bool)

	for _, et := range types {
		if seen[et] {
			t.Errorf("Duplicate EventType value: %d", et)
		}
		seen[et] = true
	}
}
