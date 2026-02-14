import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

const putColorGrade = api.events[':id']['color-grade'].$put;

export function useUpdateEventColorGrade() {
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      enabled,
      lutId,
      intensity,
      includeLuminance,
    }: {
      eventId: string;
      enabled: boolean;
      lutId: string | null;
      intensity: number;
      includeLuminance: boolean;
    }) => {
      const res = await putColorGrade(
        {
          param: { id: eventId },
          json: { enabled, lutId, intensity, includeLuminance },
        },
        await withAuth(getToken, { headers: { 'Content-Type': 'application/json' } }),
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message || 'Failed to save color grade settings');
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['event', vars.eventId, 'color-grade'] });
    },
  });
}
