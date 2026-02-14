import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export interface CreditEntry {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  promoCode: string | null;
  stripeReceiptUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CreditSummary {
  balance: number;
  expiringSoon: number;
  usedThisMonth: number;
}

export interface CreditHistoryResponse {
  data: {
    entries: CreditEntry[];
    summary: CreditSummary;
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
    };
  };
}

export function useCreditHistory(
  page: number = 0,
  limit: number = 20,
  type?: 'credit' | 'debit'
) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['credit-history', page, limit, type],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (type) params.set('type', type);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/history?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<CreditHistoryResponse>;
    },
    staleTime: 1000 * 30,
  });
}
