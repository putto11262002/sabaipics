import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

// Toggle this to switch between mock and real data
const USE_MOCK_DATA = false;

interface UploadPhotoParams {
  eventId: string;
  file: File;
}

interface UploadPhotoResponse {
  data: {
    id: string;
    thumbnailUrl: string;
    previewUrl: string;
    downloadUrl: string;
    faceCount: number | null;
    status: "processing";
    uploadedAt: string;
  };
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

// Simulate network delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate a fake UUID-like ID
function generateFakeId(): string {
  return `${Math.random().toString(36).substr(2, 8)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 12)}`;
}

export function useUploadPhoto() {
  const { getToken } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, file }: UploadPhotoParams) => {
      if (USE_MOCK_DATA) {
        // Simulate 1-2 second network delay
        await delay(1000 + Math.random() * 1000);

        // Simulate random failures (10% total)
        const random = Math.random();

        if (random < 0.05) {
          // 5% fail with 402 - Insufficient credits
          const error = new Error("Insufficient credits") as Error & { status: number; code?: string };
          error.status = 402;
          error.code = "INSUFFICIENT_CREDITS";
          throw error;
        }

        if (random < 0.08) {
          // 3% fail with 403 - Event expired
          const error = new Error("Event expired") as Error & { status: number; code?: string };
          error.status = 403;
          error.code = "EVENT_EXPIRED";
          throw error;
        }

        if (random < 0.10) {
          // 2% fail with 400 - Validation error
          const error = new Error("Invalid file format") as Error & { status: number; code?: string };
          error.status = 400;
          error.code = "VALIDATION_ERROR";
          throw error;
        }

        // 90% success - Return full photo object
        const photoId = generateFakeId();
        const timestamp = Date.now();

        return {
          data: {
            id: photoId,
            thumbnailUrl: `https://picsum.photos/400/400?random=${timestamp}`,
            previewUrl: `https://picsum.photos/1200/800?random=${timestamp}`,
            downloadUrl: `https://picsum.photos/4000/3000?random=${timestamp}`,
            faceCount: null, // Will be updated after processing
            status: "processing" as const,
            uploadedAt: new Date().toISOString(),
          },
        } as UploadPhotoResponse;
      }

      // Real API call
      const token = await getToken();

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events/${eventId}/photos`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json() as ErrorResponse;
        const errorMessage = errorData.error?.message || "Upload failed";

        // Create custom error with status code for specific handling
        const error = new Error(errorMessage) as Error & { status: number; code?: string };
        error.status = response.status;
        error.code = errorData.error?.code;
        throw error;
      }

      return response.json() as Promise<UploadPhotoResponse>;
    },
    onSuccess: (_, variables) => {
      // Invalidate photos query to refresh gallery
      queryClient.invalidateQueries({
        queryKey: ["event", variables.eventId, "photos"]
      });
    },
  });
}
