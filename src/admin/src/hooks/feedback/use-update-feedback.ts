import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UpdateFeedbackResponse = InferResponseType<
  (typeof api.admin)['feedback'][':id']['$patch'],
  SuccessStatusCode
>;

export type UpdateFeedbackInput = {
  id: string;
  status?: 'new' | 'reviewed' | 'planned' | 'completed' | 'dismissed';
  adminNote?: string | null;
};

export function useUpdateFeedback() {
  const queryClient = useQueryClient();

  return useAdminMutation<UpdateFeedbackResponse, UpdateFeedbackInput>({
    apiFn: ({ id, ...json }, opts) =>
      api.admin.feedback[':id'].$patch({ param: { id }, json }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback', 'detail', variables.id] });
    },
  });
}
