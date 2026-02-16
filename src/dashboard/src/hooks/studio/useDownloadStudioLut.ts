import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type DownloadStudioLutResponse = InferResponseType<
  (typeof api.studio.luts)[':id']['download']['$get'],
  SuccessStatusCode
>;

export type DownloadStudioLutInput = string;

export function useDownloadStudioLut() {
  return useApiMutation<DownloadStudioLutResponse, string>({
    apiFn: (id, opts) => api.studio.luts[':id'].download.$get({ param: { id } }, opts),
  });
}
