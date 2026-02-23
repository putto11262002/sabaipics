import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type CreateAnnouncementResponse = InferResponseType<
  (typeof api.admin)['announcements']['$post'],
  SuccessStatusCode
>;

export type CreateAnnouncementInput = {
  title: string;
  subtitle?: string;
  content: string;
  tag?: 'feature' | 'improvement' | 'fix' | 'maintenance';
  publishedAt?: string;
  active?: boolean;
};

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useAdminMutation<CreateAnnouncementResponse, CreateAnnouncementInput>({
    apiFn: (input, opts) =>
      api.admin.announcements.$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements', 'list'] });
    },
  });
}
