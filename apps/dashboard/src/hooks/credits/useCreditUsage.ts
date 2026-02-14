import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export interface CreditUsageEntry {
  id: string;
  amount: number;
  source: 'upload' | 'refund' | 'admin_adjustment';
  createdAt: string;
}

export interface CreditUsageChartData {
  date: string; // 'YYYY-MM-DD'
  credits: number;
}

export interface CreditUsageSummary {
  totalUsed: number;
  thisMonth: number;
  thisWeek: number;
  today: number;
}

interface CreditUsageResponse {
  data: {
    entries: CreditUsageEntry[];
    chartData: CreditUsageChartData[];
    summary: CreditUsageSummary;
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      hasMore: boolean;
    };
  };
}

export function useCreditUsage(page: number = 0, limit: number = 20) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['creditUsage', page, limit],
    queryFn: async (): Promise<CreditUsageResponse> => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/usage?page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<CreditUsageResponse>;
    },
    staleTime: 1000 * 60, // 1 minute
  });
}
