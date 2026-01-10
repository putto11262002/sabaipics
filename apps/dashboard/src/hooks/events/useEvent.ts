import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";
import type { Event } from "./useEvents";

interface EventResponse {
  data: Event;
}

export function useEvent(id: string | undefined) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      if (!id) {
        throw new Error("Event ID is required");
      }

      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Event not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<EventResponse>;
    },
    enabled: !!id, // Only run query if ID is provided
    staleTime: 1000 * 60, // 1 minute
  });
}
