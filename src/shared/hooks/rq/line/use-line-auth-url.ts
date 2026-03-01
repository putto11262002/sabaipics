import { useMutation } from '@tanstack/react-query';
import { getLineAuthUrl, type ApiError } from '@/event/src/lib/api';

export interface UseLineAuthUrlInput {
  eventId: string;
  searchId: string;
}

export function useLineAuthUrl() {
  return useMutation<string, Error, UseLineAuthUrlInput>({
    mutationFn: async (input) => {
      return await getLineAuthUrl(input.eventId, input.searchId);
    },
  });
}
