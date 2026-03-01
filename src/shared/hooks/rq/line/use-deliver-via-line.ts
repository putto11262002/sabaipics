import { useMutation } from '@tanstack/react-query';
import { deliverViaLine, type LineDeliveryResult } from '@/event/src/lib/api';

export interface UseDeliverViaLineInput {
  eventId: string;
  searchId: string;
  lineUserId: string;
}

export type { LineDeliveryResult };

export function useDeliverViaLine() {
  return useMutation<LineDeliveryResult, Error, UseDeliverViaLineInput>({
    mutationFn: async (input) => {
      return await deliverViaLine(input.eventId, input.searchId, input.lineUserId);
    },
  });
}
