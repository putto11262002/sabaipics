import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export interface CreditPurchaseEntry {
  id: string;
  amount: number;
  source: 'purchase' | 'gift' | 'discount' | 'refund' | 'admin_adjustment' | 'apple_purchase';
  createdAt: string;
  expiresAt: string;
  promoCode: string | null;
  stripeReceiptUrl: string | null;
}

interface CreditPurchasesResponse {
  data: {
    entries: CreditPurchaseEntry[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      hasMore: boolean;
    };
  };
}

export function useCreditPurchases(page: number = 0, limit: number = 20) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['creditPurchases', page, limit],
    queryFn: async (): Promise<CreditPurchasesResponse> => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/purchases?page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<CreditPurchasesResponse>;
    },
    staleTime: 1000 * 60, // 1 minute
  });
}
