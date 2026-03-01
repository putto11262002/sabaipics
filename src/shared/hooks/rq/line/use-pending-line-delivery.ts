import { useMutation } from '@tanstack/react-query';
import { createPendingLineDelivery } from '@/event/src/lib/api';

export interface UsePendingLineDeliveryInput {
  eventId: string;
  searchId: string;
  photoIds: string[];
}

export function usePendingLineDelivery() {
  return useMutation<void, Error, UsePendingLineDeliveryInput>({
    mutationFn: async (input) => {
      await createPendingLineDelivery(input.eventId, input.searchId, input.photoIds);
    },
  });
}
