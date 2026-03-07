import { useQuery } from '@tanstack/react-query';
import { getMatchedPhotos, type MatchedPhoto } from '@/event/src/lib/api';

export type { MatchedPhoto };

export function useMatchedPhotos(eventId: string) {
  return useQuery<MatchedPhoto[], Error>({
    queryKey: ['photos', 'matched', eventId],
    queryFn: () => getMatchedPhotos(eventId),
    staleTime: 30_000,
  });
}
