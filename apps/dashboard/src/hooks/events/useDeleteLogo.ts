import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useDeleteLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const response = await api.events[':id'].logo.$delete({
        param: { id: eventId },
      });

      if (!response.ok) {
        const error = new Error('Failed to delete logo') as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event'] });
      queryClient.invalidateQueries({ queryKey: ['logo'] });
    },
  });
}
