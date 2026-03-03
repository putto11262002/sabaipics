package clientmgr

import (
	"context"
	"log"
	"sync"

	ftpserver "github.com/fclairamb/ftpserverlib"
)

// EventType represents the type of client event
type EventType int

const (
	// EventAuthExpired indicates JWT token has expired (401 from API)
	EventAuthExpired EventType = iota
	// EventUploadFailed indicates an upload failed (non-auth error)
	EventUploadFailed
)

// ClientEvent represents an event reported by upload transfers
// The hub receives these events and decides what action to take
type ClientEvent struct {
	Type     EventType
	ClientID uint32
	Reason   string // Optional context about the event
}

// ManagedClient holds the client context and metadata
type ManagedClient struct {
	ID           uint32
	Context      ftpserver.ClientContext
	ClientIP     string
	UploadCtx    context.Context
	UploadCancel context.CancelFunc
}

// Manager centralizes client management and decision-making
// Upload transfers report events, the manager decides actions
type Manager struct {
	clients   map[uint32]*ManagedClient
	clientsMu sync.RWMutex
	eventChan chan ClientEvent
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// NewManager creates a new client manager
func NewManager() *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		clients:   make(map[uint32]*ManagedClient),
		eventChan: make(chan ClientEvent, 100), // Buffered channel
		ctx:       ctx,
		cancel:    cancel,
	}
}

// Start begins the event processing loop
func (m *Manager) Start() {
	m.wg.Add(1)
	go m.run()
}

// Stop gracefully shuts down the manager
func (m *Manager) Stop() {
	m.cancel()
	m.wg.Wait()
}

// RegisterClient adds a client to the manager
func (m *Manager) RegisterClient(cc ftpserver.ClientContext) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	uploadCtx, uploadCancel := context.WithCancel(m.ctx)

	client := &ManagedClient{
		ID:           cc.ID(),
		Context:      cc,
		ClientIP:     cc.RemoteAddr().String(),
		UploadCtx:    uploadCtx,
		UploadCancel: uploadCancel,
	}
	m.clients[cc.ID()] = client

	log.Printf("client_registered id=%d ip=%s", cc.ID(), client.ClientIP)
}

// UnregisterClient removes a client from the manager
func (m *Manager) UnregisterClient(clientID uint32) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	if client, exists := m.clients[clientID]; exists {
		client.UploadCancel()
		log.Printf("client_unregistered id=%d ip=%s", clientID, client.ClientIP)
		delete(m.clients, clientID)
	}
}

// GetUploadContext returns the upload context for a client
func (m *Manager) GetUploadContext(clientID uint32) (context.Context, bool) {
	m.clientsMu.RLock()
	defer m.clientsMu.RUnlock()

	client, exists := m.clients[clientID]
	if !exists {
		return nil, false
	}

	return client.UploadCtx, true
}

// SendEvent sends an event to the manager for processing
// This is non-blocking - events are buffered
func (m *Manager) SendEvent(event ClientEvent) {
	select {
	case m.eventChan <- event:
		// Event sent successfully
	default:
		// Channel full, log warning but don't block
		log.Printf("client_event_dropped reason=channel_full client_id=%d", event.ClientID)
	}
}

// EventChan returns the event channel for sending events
func (m *Manager) EventChan() chan<- ClientEvent {
	return m.eventChan
}

// run is the main event processing loop (read pump)
// This is where decisions are made based on events
func (m *Manager) run() {
	defer m.wg.Done()

	log.Printf("client_event_loop_started")

	for {
		select {
		case <-m.ctx.Done():
			log.Printf("client_event_loop_stopped")
			return

		case event := <-m.eventChan:
			m.handleEvent(event)
		}
	}
}

// handleEvent processes a single event and decides what action to take
// All client management decisions are centralized here
func (m *Manager) handleEvent(event ClientEvent) {
	switch event.Type {
	case EventAuthExpired:
		// Decision: Disconnect client when auth expires
		log.Printf("client_auth_expired client_id=%d action=disconnect", event.ClientID)
		m.disconnectClient(event.ClientID, "authentication expired")

	case EventUploadFailed:
		// Decision: Log the failure but keep connection open
		// Client can retry or upload other files
		log.Printf("client_upload_failed client_id=%d reason=%s", event.ClientID, event.Reason)

	default:
		log.Printf("client_event_unknown type=%d client_id=%d", event.Type, event.ClientID)
	}
}

// disconnectClient closes the connection for a specific client
func (m *Manager) disconnectClient(clientID uint32, reason string) {
	m.clientsMu.RLock()
	client, exists := m.clients[clientID]
	m.clientsMu.RUnlock()

	if !exists {
		log.Printf("client_disconnect_skipped reason=not_found client_id=%d", clientID)
		return
	}

	log.Printf("client_disconnecting id=%d ip=%s reason=%s", clientID, client.ClientIP, reason)

	if err := client.Context.Close(); err != nil {
		log.Printf("client_disconnect_error id=%d error=%v", clientID, err)
	}
}
