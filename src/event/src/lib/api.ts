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

export async function getEventPublic(eventId: string): Promise<EventPublic> {
  const response = await fetch(`${API_URL}/participant/events/${eventId}`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: EventPublic };
  return result.data;
}

export async function searchPhotos(
  eventId: string,
  selfie: File,
  consentAccepted: boolean,
): Promise<SearchResult> {
  const formData = new FormData();
  formData.append('selfie', selfie);
  formData.append('consentAccepted', String(consentAccepted));

  const response = await fetch(`${API_URL}/participant/events/${eventId}/search`, {
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

export async function downloadBulk(eventId: string, photoIds: string[]): Promise<Blob> {
  const response = await fetch(`${API_URL}/participant/events/${eventId}/photos/download`, {
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
}

export async function getLineStatus(eventId: string): Promise<LineStatus> {
  const params = new URLSearchParams({ eventId });
  const response = await fetch(`${API_URL}/participant/line/status?${params.toString()}`);

  if (!response.ok) {
    // Default to available if check fails — don't block the button on network errors
    return { available: true };
  }

  const result = (await response.json()) as { data: LineStatus };
  return result.data;
}

export async function getLineAuthUrl(eventId: string, searchId: string): Promise<string> {
  const params = new URLSearchParams({ eventId, searchId });
  const response = await fetch(`${API_URL}/participant/line/auth?${params.toString()}`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.code || 'UNKNOWN_ERROR');
  }

  const result = (await response.json()) as { data: LineAuthResponse };
  return result.data.authUrl;
}

export async function deliverViaLine(
  eventId: string,
  searchId: string,
  lineUserId: string,
): Promise<LineDeliveryResult> {
  const response = await fetch(`${API_URL}/participant/line/deliver`, {
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
