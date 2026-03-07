import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteSelfie } from '@/event/src/lib/api';

export function useDeleteSelfie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (selfieId: string) => deleteSelfie(selfieId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant', 'session'] });
    },
  });
}
