import { useQuery } from '@tanstack/react-query';
import { getLineStatus } from '@/event/src/lib/api';

export interface UseLineStatusInput {
  eventId: string;
}

export interface LineStatus {
  available: boolean;
}

export function useLineStatus(input: UseLineStatusInput) {
  return useQuery<LineStatus, Error>({
    queryKey: ['line', 'status', input.eventId],
    queryFn: () => getLineStatus(input.eventId),
    staleTime: 1000 * 60, // Cache for 1 minute
    retry: 1,
  });
}
