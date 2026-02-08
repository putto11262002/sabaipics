import { useMutation } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

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
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async (input: TopUpCheckoutInput): Promise<TopUpCheckoutResult> => {
      const token = await getToken();

      if (!token) {
        throw new Error('Not authenticated. Please sign in and try again.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          (errorData as any).error?.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const json = await response.json();
      return json.data as TopUpCheckoutResult;
    },
    retry: false,
  });
}
