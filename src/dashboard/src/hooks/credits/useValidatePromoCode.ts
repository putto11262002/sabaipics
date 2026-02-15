import { useQuery } from '@tanstack/react-query';

interface GiftCodeData {
  type: 'gift';
  code: string;
  credits: number;
  maxAmountThb: number;
  expiresAt: string | null;
}

interface DiscountCodeData {
  type: 'discount';
  code: string;
  discountPercent: number;
  discountAmount: number;
  discountType: 'percent' | 'amount';
  minAmountThb: number | null;
}

type PromoCodeData = GiftCodeData | DiscountCodeData;

interface PromoCodeValidationResponse {
  data: PromoCodeData;
}

export function useValidatePromoCode(code: string, enabled = true) {
  return useQuery<PromoCodeValidationResponse>({
    queryKey: ['promo-code-validate', code],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/promo-code/validate?code=${encodeURIComponent(code)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          (errorData as any).error?.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response.json();
    },
    enabled: enabled && !!code,
    retry: false,
    staleTime: 0, // Always validate fresh
  });
}
