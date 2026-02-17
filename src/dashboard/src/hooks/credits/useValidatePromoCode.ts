import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getPromoCodeValidate = api['credit-packages']['promo-code'].validate.$get;
type PromoCodeValidateResponse = InferResponseType<typeof getPromoCodeValidate, SuccessStatusCode>;

export interface GiftCodeData {
  type: 'gift';
  code: string;
  credits: number;
  maxAmountThb: number;
  expiresAt: string | null;
}

export interface DiscountCodeData {
  type: 'discount';
  code: string;
  discountPercent: number;
  discountAmount: number;
  discountType: 'percent' | 'amount';
  minAmountThb: number | null;
}

export type PromoCodeData = GiftCodeData | DiscountCodeData;

export interface PromoCodeValidationResponse {
  data: PromoCodeData;
}

export function useValidatePromoCode(code: string, enabled = true) {
  return useApiQuery<PromoCodeValidateResponse>({
    queryKey: ['promo-code-validate', code],
    apiFn: (opts) =>
      getPromoCodeValidate(
        { query: { code } },
        opts,
      ),
    withAuth: false,
    enabled: enabled && !!code,
    retry: false,
    staleTime: 0, // Always validate fresh
  });
}
