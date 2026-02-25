import { useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const listUploadIntents = api.uploads.events[':eventId'].$get;

type UploadIntentsResponse = InferResponseType<typeof listUploadIntents, 200>;
export type UploadIntent = UploadIntentsResponse['data'][0];

export function useRecentUploads(eventId: string | undefined, limit = 10) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const query = useApiQuery<UploadIntentsResponse>({
    queryKey: ['event', eventId, 'upload-intents', cursor, limit],
    apiFn: (opts) =>
      listUploadIntents(
        {
          param: { eventId: eventId! },
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
          },
        },
        opts,
      ),
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
    refetch: query.refetch,
    hasNextPage: query.data?.pagination.hasMore ?? false,
    hasPreviousPage: cursorHistory.length > 0,
    goToNextPage,
    goToPreviousPage,
    page: cursorHistory.length + 1,
  };
}
