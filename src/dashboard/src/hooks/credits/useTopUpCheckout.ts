import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const postCheckout = api['credit-packages'].checkout.$post;
type TopUpCheckoutResponse = InferResponseType<typeof postCheckout, SuccessStatusCode>;

export interface TopUpCheckoutInput {
  amount: number;
  promoCode?: string;
}

export interface TopUpCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  preview: {
    originalAmount: number;
    finalAmount: number;
    discountPercent: number;
    bonusCredits: number;
    creditAmount: number;
    effectiveRate: number;
  };
}

export function useTopUpCheckout() {
  return useApiMutation<TopUpCheckoutResponse, TopUpCheckoutInput>({
    apiFn: (input, opts) =>
      postCheckout({ json: input }, opts),
    retry: false,
  });
}
