package clientmgr

import (
	"context"
	"sync"

	ftpserver "github.com/fclairamb/ftpserverlib"
	"github.com/getsentry/sentry-go"
)

// EventType represents the type of client event
type EventType int

const (
	// EventAuthExpired indicates JWT token has expired (401 from API)
	EventAuthExpired EventType = iota
	// EventUploadFailed indicates an upload failed (non-auth error)
	EventUploadFailed
	// EventRateLimited indicates client hit rate limit (429 from API)
	EventRateLimited
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
	ID       uint32
	Context  ftpserver.ClientContext
	ClientIP string
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

	client := &ManagedClient{
		ID:       cc.ID(),
		Context:  cc,
		ClientIP: cc.RemoteAddr().String(),
	}
	m.clients[cc.ID()] = client

	sentry.NewLogger(context.Background()).Info().Emitf(
		"ClientManager: Registered client %d (%s)", cc.ID(), client.ClientIP)
}

// UnregisterClient removes a client from the manager
func (m *Manager) UnregisterClient(clientID uint32) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	if client, exists := m.clients[clientID]; exists {
		sentry.NewLogger(context.Background()).Info().Emitf(
			"ClientManager: Unregistered client %d (%s)", clientID, client.ClientIP)
		delete(m.clients, clientID)
	}
}

// SendEvent sends an event to the manager for processing
// This is non-blocking - events are buffered
func (m *Manager) SendEvent(event ClientEvent) {
	select {
	case m.eventChan <- event:
		// Event sent successfully
	default:
		// Channel full, log warning but don't block
		sentry.NewLogger(context.Background()).Warn().Emitf(
			"ClientManager: Event channel full, dropping event for client %d", event.ClientID)
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

	log := sentry.NewLogger(context.Background())
	log.Info().Emitf("ClientManager: Started event processing loop")

	for {
		select {
		case <-m.ctx.Done():
			log.Info().Emitf("ClientManager: Shutting down event processing loop")
			return

		case event := <-m.eventChan:
			m.handleEvent(event)
		}
	}
}

// handleEvent processes a single event and decides what action to take
// All client management decisions are centralized here
func (m *Manager) handleEvent(event ClientEvent) {
	log := sentry.NewLogger(context.Background())

	switch event.Type {
	case EventAuthExpired:
		// Decision: Disconnect client when auth expires
		log.Info().Emitf("ClientManager: Auth expired for client %d, disconnecting", event.ClientID)
		m.disconnectClient(event.ClientID, "authentication expired")

	case EventUploadFailed:
		// Decision: Log the failure but keep connection open
		// Client can retry or upload other files
		log.Warn().Emitf("ClientManager: Upload failed for client %d: %s", event.ClientID, event.Reason)

	case EventRateLimited:
		// Decision: Disconnect client when rate limited
		// They can reconnect after cooldown
		log.Warn().Emitf("ClientManager: Client %d rate limited, disconnecting", event.ClientID)
		m.disconnectClient(event.ClientID, "rate limited")

	default:
		log.Warn().Emitf("ClientManager: Unknown event type %d for client %d", event.Type, event.ClientID)
	}
}

// disconnectClient closes the connection for a specific client
func (m *Manager) disconnectClient(clientID uint32, reason string) {
	m.clientsMu.RLock()
	client, exists := m.clients[clientID]
	m.clientsMu.RUnlock()

	if !exists {
		sentry.NewLogger(context.Background()).Warn().Emitf(
			"ClientManager: Cannot disconnect client %d - not found", clientID)
		return
	}

	sentry.NewLogger(context.Background()).Info().Emitf(
		"ClientManager: Disconnecting client %d (%s): %s", clientID, client.ClientIP, reason)

	if err := client.Context.Close(); err != nil {
		sentry.NewLogger(context.Background()).Error().Emitf(
			"ClientManager: Failed to disconnect client %d: %v", clientID, err)
	}
}
