import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const deletePhotos = api.events[':eventId'].photos.delete.$post;

type DeletePhotosResponse = InferResponseType<typeof deletePhotos, SuccessStatusCode>;

interface DeletePhotosParams {
  eventId: string;
  photoIds: string[];
}

export function useDeletePhotos() {
  const queryClient = useQueryClient();

  return useApiMutation<DeletePhotosResponse, DeletePhotosParams>({
    apiFn: (input, opts) =>
      deletePhotos(
        {
          param: { eventId: input.eventId },
          json: { photoIds: input.photoIds },
        },
        opts,
      ),
    onSuccess: (_data, variables) => {
      // Invalidate the photos query to refetch the list
      queryClient.invalidateQueries({
        queryKey: ['event', variables.eventId, 'photos'],
      });
    },
  });
}
