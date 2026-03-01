import { useMutation } from '@tanstack/react-query';
import { downloadBulk } from '@/event/src/lib/api';

export interface UseDownloadBulkInput {
  eventId: string;
  photoIds: string[];
}

export function useDownloadBulk() {
  return useMutation<Blob, Error, UseDownloadBulkInput>({
    mutationFn: async (input) => {
      return await downloadBulk(input.eventId, input.photoIds);
    },
  });
}
