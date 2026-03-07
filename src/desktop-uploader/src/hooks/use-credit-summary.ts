import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { createAuthClient } from '../lib/api';

export type CreditSummary = {
  balance: number;
  expiringSoon: number;
  usedThisMonth: number;
};

type CreditHistoryResponse = {
  data: {
    summary: CreditSummary;
  };
};

export function useCreditSummary() {
  const { getAccessToken, status } = useAuth();

  return useQuery({
    queryKey: ['credit-summary'],
    enabled: status === 'signed_in',
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const client = createAuthClient(token);
      const res = await client['credit-packages'].history.$get({
        query: { page: '0', limit: '1' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const json = (await res.json()) as CreditHistoryResponse;
      return json.data.summary;
    },
    staleTime: 1000 * 30,
  });
}
