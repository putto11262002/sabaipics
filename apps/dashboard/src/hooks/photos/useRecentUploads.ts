import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const listUploadIntents = api.uploads.events[':eventId'].$get;

export type UploadIntent = InferResponseType<typeof listUploadIntents, 200>['data'][0];

export function useRecentUploads(eventId: string | undefined, limit = 10) {
  const { getToken } = useApiClient();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ['event', eventId, 'upload-intents', cursor, limit],
    queryFn: async () => {
      if (!eventId) throw new Error('eventId is required');

      const res = await listUploadIntents(
        {
          param: { eventId },
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
          },
        },
        await withAuth(getToken),
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch upload intents: ${res.status}`);
      }

      return (await res.json()) as InferResponseType<typeof listUploadIntents, 200>;
    },
    enabled: !!eventId,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const goToNextPage = useCallback(() => {
    const nextCursor = query.data?.pagination.nextCursor;
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, cursor ?? '']);
    setCursor(nextCursor);
  }, [query.data?.pagination.nextCursor, cursor]);

  const goToPreviousPage = useCallback(() => {
    setCursorHistory((prev) => {
      const next = [...prev];
      const prevCursor = next.pop();
      setCursor(prevCursor || undefined);
      return next;
    });
  }, []);

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    hasNextPage: query.data?.pagination.hasMore ?? false,
    hasPreviousPage: cursorHistory.length > 0,
    goToNextPage,
    goToPreviousPage,
    page: cursorHistory.length + 1,
  };
}
