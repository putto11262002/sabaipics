import { useInfiniteQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

// Toggle this to switch between mock and real data
const USE_MOCK_DATA = false;

export interface Photo {
  id: string;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  faceCount: number | null;
  status: "processing" | "indexed" | "failed";
  uploadedAt: string;
}

interface PhotosResponse {
  data: Photo[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

interface UsePhotosParams {
  eventId: string | undefined;
  limit?: number;
}

// Stable mock data cache (generated once on module load)
// Commented out since we're using real API now
/*
const MOCK_PHOTOS_CACHE: Photo[] = (() => {
  const statuses: Photo['status'][] = [
    'indexed', 'indexed', 'indexed', 'indexed', 'indexed', 'indexed', 'indexed',
    'processing', 'processing', 'failed'
  ];
  const photos: Photo[] = [];

  // Generate 100 stable mock photos
  for (let i = 0; i < 100; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const faceCount = Math.random() < 0.1 ? null : Math.floor(Math.random() * 11);

    photos.push({
      id: `photo-${i}`, // Stable ID without random component
      thumbnailUrl: `https://picsum.photos/400/400?random=${i}`, // Stable URL
      previewUrl: `https://picsum.photos/1200/800?random=${i}`,
      downloadUrl: `https://picsum.photos/4000/3000?random=${i}`,
      faceCount,
      status,
      uploadedAt: new Date(Date.now() - i * 3600000).toISOString(), // 1 hour apart
    });
  }

  return photos;
})();
*/

// Simulate network delay (only used in mock mode)
// function delay(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

export function usePhotos({ eventId, limit = 50 }: UsePhotosParams) {
  const { getToken } = useApiClient();

  return useInfiniteQuery({
    queryKey: ["event", eventId, "photos"],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!eventId) {
        throw new Error("Event ID is required");
      }

      if (USE_MOCK_DATA) {
        // Mock data code - not used when USE_MOCK_DATA is false
        // Kept for easy re-enabling during development
        throw new Error("Mock data is disabled");
      }

      // Real API call
      const token = await getToken();

      const queryParams = new URLSearchParams();
      if (pageParam) queryParams.append("cursor", pageParam);
      queryParams.append("limit", limit.toString());
      queryParams.append("status", "indexed"); // Only fetch indexed photos

      const url = `${import.meta.env.VITE_API_URL}/events/${eventId}/photos?${queryParams.toString()}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Event not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<PhotosResponse>;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: !!eventId,
    staleTime: import.meta.env.DEV ? Infinity : 1000 * 60, // Never stale in dev, 1 min in prod
    refetchOnWindowFocus: !import.meta.env.DEV, // Disable refetch on window focus in dev
    refetchOnMount: false, // Don't refetch on mount if data exists
  });
}
