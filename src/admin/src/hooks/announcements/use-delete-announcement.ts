import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type DeleteAnnouncementResponse = InferResponseType<
  (typeof api.admin)['announcements'][':id']['$delete'],
  SuccessStatusCode
>;

export type DeleteAnnouncementInput = { id: string };

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useAdminMutation<DeleteAnnouncementResponse, DeleteAnnouncementInput>({
    apiFn: ({ id }, opts) =>
      api.admin.announcements[':id'].$delete({ param: { id } }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements', 'list'] });
      queryClient.removeQueries({ queryKey: ['admin', 'announcements', 'detail', variables.id] });
    },
  });
}
