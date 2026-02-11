# Events Browser (SAB-39)

## Overview

The Events Browser allows photographers to view their recent events and see detailed information about each event. This is a read-only feature for browsing events; event selection for capture happens in SAB-40.

## Features

### Events List View
- Displays the 10 most recent events
- Pull-to-refresh to reload events
- Loading state with progress indicator
- Empty state when no events exist
- Error state with retry button
- Tap event to view details

### Event Detail View
- Shows complete event information in iOS Settings-style Form:
  - Event name
  - Subtitle (if set, full-width with text wrapping)
  - Start and end dates (if set)
  - Creation and expiration dates
- Toolbar menu with copy actions:
  - Copy search link to clipboard
  - Copy slideshow link to clipboard
  - Visual confirmation when copied (2 seconds)

## Architecture

### Data Flow
```
EventsHomeView
    ↓ (init)
EventsAPIClient (baseURL from Info.plist)
    ↓ (fetchEvents)
Clerk.shared.session.getToken()
    ↓ (Authorization header)
GET /events?page=0&limit=10
    ↓ (decode)
EventsResponse → [Event]
    ↓ (display)
List with NavigationLinks
```

### API Client
- **EventsAPIClient** (actor for thread safety)
  - Authenticates requests using Clerk session token
  - Handles network errors gracefully
  - Provides typed responses

### Models
- **Event**: Core event data structure
- **EventsResponse**: List wrapper with pagination
- **EventResponse**: Single event wrapper
- **Pagination**: Metadata for list pagination

### Views
- **EventsHomeView**: Main list view with states (`.insetGrouped` style)
- **EventRow**: Individual event row component (shows event name + relative time)
- **EventDetailView**: iOS native Form-based detail view matching ProfileView pattern

### Utilities
- **DateFormatter+Extensions**: Date parsing and formatting helpers

## Configuration

Environment-specific URLs are configured in `.xcconfig` files:

### Debug (Studio.Debug.xcconfig)
```
API_BASE_URL = https://dev-api.sabaipics.com
EVENT_FRONTEND_URL = https://dev.sabaipics.com
```

### Release (Studio.Release.xcconfig)
```
API_BASE_URL = https://api.sabaipics.com
EVENT_FRONTEND_URL = https://sabaipics.com
```

These are injected into Info.plist at build time and accessed via:
```swift
Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
Bundle.main.object(forInfoDictionaryKey: "EventFrontendURL") as? String
```

## API Integration

### Authentication
All API requests include a Clerk session token:
```swift
Authorization: Bearer <jwt>
```

### Endpoints

#### GET /events
**Query Parameters:**
- `page`: Page number (default: 0)
- `limit`: Events per page (default: 10)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Wedding Event",
      "subtitle": "John & Jane's Wedding" | null,
      "logoUrl": "https://r2.../logo.jpg" | null,
      "startDate": "2026-01-20T10:00:00Z" | null,
      "endDate": "2026-01-20T22:00:00Z" | null,
      "createdAt": "2026-01-15T08:00:00Z",
      "expiresAt": "2026-02-20T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 0,
    "limit": 10,
    "totalCount": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

#### GET /events/:id
**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Wedding Event",
    "subtitle": "John & Jane's Wedding" | null,
    "logoUrl": "https://r2.../logo.jpg" | null,
    "startDate": "2026-01-20T10:00:00Z" | null,
    "endDate": "2026-01-20T22:00:00Z" | null,
    "createdAt": "2026-01-15T08:00:00Z",
    "expiresAt": "2026-02-20T00:00:00Z"
  }
}
```

## Error Handling

### API Errors
```swift
enum APIError: Error {
    case notAuthenticated       // User not signed in
    case invalidURL            // Malformed URL
    case noToken               // No auth token available
    case networkError(Error)   // Network failure
    case decodingError(Error)  // JSON decode failure
    case httpError(statusCode: Int, message: String?)
}
```

### User-Facing States
1. **Loading**: Progress indicator while fetching
2. **Empty**: Calendar icon + "No events yet"
3. **Error**: Error icon + message + retry button
4. **Success**: List of events

## User Experience

### Navigation Flow
```
Events Tab → EventsHomeView (List)
    → Tap Event → EventDetailView
        → Back → EventsHomeView (List)
```

### Interactions
- **Pull down**: Refresh events list
- **Tap event row**: Navigate to detail view
- **Tap retry button**: Reload after error
- **Tap copy button**: Copy search link to clipboard

### Visual Feedback
- Loading spinner with "Loading events..." message
- Pull-to-refresh indicator
- Copy confirmation: Green checkmark + "Copied to clipboard" (2 seconds)
- Error state: Red warning triangle

## Testing

### Manual Testing Checklist
- [ ] Sign in with Clerk
- [ ] Navigate to Events tab
- [ ] Verify events list loads (if photographer has events)
- [ ] Verify empty state shows (if no events)
- [ ] Pull to refresh
- [ ] Tap an event to view details
- [ ] Verify logo displays (or placeholder)
- [ ] Verify all event fields display correctly
- [ ] Copy search link to clipboard
- [ ] Verify copy confirmation appears
- [ ] Tap back to return to list
- [ ] Force an error (airplane mode) and verify error state
- [ ] Tap retry button

### Edge Cases
- No events (new photographer)
- Events without subtitle
- Events without start/end dates
- Long subtitle text (wraps properly)
- Network offline
- Authentication expired
- PostgreSQL timestamp format from API (handled)

## Known Limitations

1. **No pagination UI**: Only shows first 10 events (API supports pagination)
2. **No cache UI**: The app may show cached events when offline, but does not currently surface "last updated" state in the UI
3. **No search/filter**: Shows events in chronological order only
4. **No Thai localization**: Dates use standard iOS format

## Future Enhancements (Out of Scope)

- Infinite scroll or pagination controls
- Local caching with CoreData or SQLite
- Offline mode with sync
- Search and filter functionality
- Thai Buddhist calendar support
- Event creation from iOS app
- Event editing from iOS app

## Related Documentation

- [Clerk Auth](./001_clerk-auth.md)
- [App Shell](./APP_SHELL.md)
- [API Documentation](../../../apps/api/README.md)

## Related Tickets

- **SAB-38**: Clerk Authentication (prerequisite)
- **SAB-39**: Events Browser (this feature)
- **SAB-40**: Event Selection for Capture (next feature)
