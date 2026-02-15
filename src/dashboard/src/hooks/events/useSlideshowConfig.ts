import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InferResponseType, InferRequestType } from 'hono/client';

const getConfig = api.events[':id']['slideshow-config'].$get;
const putConfig = api.events[':id']['slideshow-config'].$put;

export type SlideshowConfigResponse = InferResponseType<typeof getConfig, 200>;

export function useSlideshowConfig(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event', eventId, 'slideshow-config'],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const res = await getConfig(
        {
          param: { id: eventId },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error(`Failed to fetch slideshow config: ${res.status}`);
      }

      return (await res.json()) as SlideshowConfigResponse;
    },
    enabled: !!eventId,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60,
  });
}

export function useUpdateSlideshowConfig(eventId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: InferRequestType<typeof putConfig>['json']) => {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const res = await putConfig(
        {
          param: { id: eventId },
          json: config,
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error(`Failed to save slideshow config: ${res.status}`);
      }

      return (await res.json()) as InferResponseType<typeof putConfig, 200>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId, 'slideshow-config'] });
    },
  });
}
