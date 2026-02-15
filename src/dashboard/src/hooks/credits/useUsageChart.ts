import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export interface UsageChartEntry {
  date: string;
  credits: number;
}

interface UsageChartResponse {
  data: UsageChartEntry[];
}

export function useUsageChart(days: number = 30) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['credit-usage-chart', days],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/usage-chart?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as UsageChartResponse;
      return json.data;
    },
    staleTime: 1000 * 60,
  });
}
