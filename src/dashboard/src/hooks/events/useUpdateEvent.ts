import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      subtitle,
    }: {
      id: string;
      name?: string;
      subtitle?: string | null;
    }) => {
      const response = await api.events[':id'].$put(
        {
          param: { id },
          json: { name, subtitle },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!response.ok) {
        const error = new Error('Failed to update event') as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event'] });
    },
  });
}
