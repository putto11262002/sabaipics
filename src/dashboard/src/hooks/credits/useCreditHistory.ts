import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getCreditHistory = api['credit-packages'].history.$get;
type CreditHistoryApiResponse = InferResponseType<typeof getCreditHistory, SuccessStatusCode>;

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

export function useCreditHistory(page: number = 0, limit: number = 20, type?: 'credit' | 'debit') {
  return useApiQuery<CreditHistoryApiResponse>({
    queryKey: ['credit-history', page, limit, type],
    apiFn: (opts) => getCreditHistory({ query: { page, limit, ...(type ? { type } : {}) } }, opts),
    staleTime: 1000 * 30,
  });
}
