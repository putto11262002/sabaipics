import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const deletePhotos = api.events[':eventId'].photos.delete.$post;

type DeletePhotosResponse = InferResponseType<typeof deletePhotos, 200>;

interface DeletePhotosParams {
  eventId: string;
  photoIds: string[];
}

export function useDeletePhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, photoIds }: DeletePhotosParams) => {
      const res = await api.events[':eventId'].photos.delete.$post(
        {
          param: { eventId },
          json: { photoIds },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to delete photos: ${res.status}`);
      }

      return (await res.json()) as DeletePhotosResponse;
    },
    onSuccess: (_data, variables) => {
      // Invalidate the photos query to refetch the list
      queryClient.invalidateQueries({
        queryKey: ['event', variables.eventId, 'photos'],
      });
    },
  });
}
