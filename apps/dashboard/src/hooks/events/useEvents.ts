import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

export interface Event {
  id: string;
  photographerId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  accessCode: string;
  qrCodeUrl: string | null;
  rekognitionCollectionId: string | null;
  expiresAt: string;
  createdAt: string;
}

interface EventsResponse {
  data: Event[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function useEvents(page: number = 0, limit: number = 20) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ["events", page, limit],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events?page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<EventsResponse>;
    },
    staleTime: 1000 * 30, // 30 seconds
  });
}
