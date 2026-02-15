import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";
import type { Event } from "./useEvents";

interface CreateEventRequest {
  name: string;
  startDate?: string;
  endDate?: string;
}

interface CreateEventResponse {
  data: Event;
}

interface CreateEventError {
  error: {
    code: string;
    message: string;
  };
}

export function useCreateEvent() {
  const { getToken } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateEventRequest) => {
      const token = await getToken();

      if (!token) {
        throw new Error("Not authenticated. Please sign in and try again.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json()) as CreateEventError;
        throw new Error(
          errorData.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response.json() as Promise<CreateEventResponse>;
    },
    onSuccess: () => {
      // Invalidate events list and dashboard to refresh data
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
