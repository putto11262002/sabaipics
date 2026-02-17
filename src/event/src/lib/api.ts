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
