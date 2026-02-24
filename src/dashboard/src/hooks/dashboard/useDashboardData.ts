import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type DashboardDataResponse = InferResponseType<typeof api.dashboard.$get, SuccessStatusCode>;

export interface DashboardEvent {
  id: string;
  name: string;
  photoCount: number;
  faceCount: number;
  createdAt: string;
  expiresAt: string;
  startDate: string | null;
  endDate: string | null;
}

export interface DashboardResponse {
  credits: {
    balance: number;
    nearestExpiry: string | null;
  };
  events: DashboardEvent[];
  stats: {
    totalPhotos: number;
    totalFaces: number;
  };
}

export function useDashboardData() {
  return useApiQuery<DashboardDataResponse>({
    queryKey: ['dashboard'],
    apiFn: (opts) => api.dashboard.$get({}, opts),
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true, // Auto-refresh when user returns from Stripe
  });
}
