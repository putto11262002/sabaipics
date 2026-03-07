import { tracingFetch } from './tracing-fetch';
const API_URL = import.meta.env.VITE_API_URL;

export interface SearchResult {
  searchId: string;
  photos: Array<{
    photoId: string;
    thumbnailUrl: string;
    previewUrl: string;
    similarity: number;
  }>;
}

export interface SearchResponse {
  data: SearchResult;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface EventPublic {
  name: string;
}

// =============================================================================
// Session
// =============================================================================

export interface SessionSelfie {
  id: string;
  thumbnailUrl: string;
}

export interface SessionState {
  hasConsent: boolean;
  lineUserId: string | null;
  isFriend: boolean;
  selfies: SessionSelfie[];
}

export async function getSessionState(): Promise<SessionState | null> {
  const response = await tracingFetch(`${API_URL}/participant/session`);
  if (!response.ok) return null;
  const result = (await response.json()) as { data: SessionState | null };
  return result.data;
}

export async function acceptConsent(): Promise<void> {
  await tracingFetch(`${API_URL}/participant/session/consent`, { method: 'POST' });
}

export async function deleteSession(): Promise<void> {
  const response = await tracingFetch(`${API_URL}/participant/session`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }
}

export async function deleteSelfie(selfieId: string): Promise<void> {
  const response = await tracingFetch(`${API_URL}/participant/session/selfies/${selfieId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }
}

// =============================================================================
// Events
// =============================================================================

export async function getEventPublic(eventId: string): Promise<EventPublic> {
  const response = await tracingFetch(`${API_URL}/participant/events/${eventId}`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: EventPublic };
  return result.data;
}

export async function searchPhotos(
  eventId: string,
  input: { selfie: File } | { selfieId: string },
  consentAccepted: boolean,
): Promise<SearchResult> {
  const formData = new FormData();
  if ('selfie' in input) {
    formData.append('selfie', input.selfie);
  } else {
    formData.append('selfieId', input.selfieId);
  }
  formData.append('consentAccepted', String(consentAccepted));

  const response = await tracingFetch(`${API_URL}/participant/events/${eventId}/search`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as SearchResponse;
  return result.data;
}

export interface MatchedPhoto {
  photoId: string;
  thumbnailUrl: string;
  previewUrl: string;
}

export async function getMatchedPhotos(eventId: string): Promise<MatchedPhoto[]> {
  const response = await tracingFetch(`${API_URL}/participant/events/${eventId}/photos/matched`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: MatchedPhoto[] };
  return result.data;
}

export async function downloadBulk(eventId: string, photoIds: string[]): Promise<Blob> {
  const response = await tracingFetch(`${API_URL}/participant/events/${eventId}/photos/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photoIds }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  return response.blob();
}

// =============================================================================
// LINE Delivery
// =============================================================================

export interface LineAuthResponse {
  authUrl: string;
}

export interface LineDeliveryResult {
  status: 'sent' | 'partial';
  photoCount: number;
  messageCount: number;
  creditCharged: boolean;
}

export interface LineStatus {
  available: boolean;
  photoCap: number | null;
}

export async function getLineStatus(eventId: string): Promise<LineStatus> {
  const params = new URLSearchParams({ eventId });
  const response = await tracingFetch(`${API_URL}/participant/line/status?${params.toString()}`);

  if (!response.ok) {
    // Default to available if check fails — don't block the button on network errors
    return { available: true, photoCap: null };
  }

  const result = (await response.json()) as { data: LineStatus };
  return result.data;
}

export async function getLineAuthUrl(eventId: string, searchId: string): Promise<string> {
  const params = new URLSearchParams({ eventId, searchId });
  const response = await tracingFetch(`${API_URL}/participant/line/auth?${params.toString()}`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: LineAuthResponse };
  return result.data.authUrl;
}

export async function createPendingLineDelivery(
  eventId: string,
  searchId: string,
  photoIds: string[],
): Promise<void> {
  const response = await fetch(`${API_URL}/participant/line/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, searchId, photoIds }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }
}

export async function deliverViaLine(
  eventId: string,
  searchId: string,
  lineUserId: string,
): Promise<LineDeliveryResult> {
  const response = await tracingFetch(`${API_URL}/participant/line/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, searchId, lineUserId }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: LineDeliveryResult };
  return result.data;
}

export interface FriendshipStatus {
  isFriend: boolean;
  displayName?: string;
}

export async function checkFriendshipStatus(lineUserId: string): Promise<FriendshipStatus> {
  const params = new URLSearchParams({ lineUserId });
  const response = await fetch(`${API_URL}/participant/line/friendship?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    // On error, assume not friend
    return { isFriend: false };
  }

  const result = (await response.json()) as { data: FriendshipStatus };
  return result.data;
}

// =============================================================================
// Slideshow
// =============================================================================

export interface SlideshowData {
  event: {
    name: string;
    subtitle: string | null;
    logoUrl: string | null;
  };
  config: {
    template: string;
    primaryColor: string;
    background: string;
  };
  stats: {
    photoCount: number;
    searchCount: number;
  };
}

export interface SlideshowPhoto {
  id: string;
  previewUrl: string;
  width: number;
  height: number;
}

export interface SlideshowPhotosResponse {
  data: SlideshowPhoto[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export async function getSlideshowData(eventId: string): Promise<SlideshowData> {
  const response = await fetch(`${API_URL}/participant/events/${eventId}/slideshow`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: SlideshowData };
  return result.data;
}

export async function getSlideshowPhotos(
  eventId: string,
  limit: number = 10,
): Promise<SlideshowPhotosResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(
    `${API_URL}/participant/events/${eventId}/photos?${params.toString()}`,
  );

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  return (await response.json()) as SlideshowPhotosResponse;
}
