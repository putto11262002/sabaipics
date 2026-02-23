import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UpdateAnnouncementResponse = InferResponseType<
  (typeof api.admin)['announcements'][':id']['$patch'],
  SuccessStatusCode
>;

export type UpdateAnnouncementInput = {
  id: string;
  title?: string;
  subtitle?: string | null;
  content?: string;
  tag?: 'feature' | 'improvement' | 'fix' | 'maintenance' | null;
  publishedAt?: string | null;
  active?: boolean;
};

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useAdminMutation<UpdateAnnouncementResponse, UpdateAnnouncementInput>({
    apiFn: ({ id, ...json }, opts) =>
      api.admin.announcements[':id'].$patch(
        { param: { id }, json },
        opts,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements', 'detail', variables.id] });
    },
  });
}
