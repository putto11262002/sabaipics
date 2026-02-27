import { api } from '@/dashboard/src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '../use-api-mutation';
import { useApiQuery } from '../use-api-query';
import type { SlideshowTemplateId } from '@/shared/slideshow';

type GetSlideshowSettingsResponse = InferResponseType<
  (typeof api.events)[':id']['slideshow-settings']['$get'],
  SuccessStatusCode
>;
type PutSlideshowSettingsResponse = InferResponseType<
  (typeof api.events)[':id']['slideshow-settings']['$put'],
  SuccessStatusCode
>;

// Exported types for components
export type SlideshowSettingsData = GetSlideshowSettingsResponse['data'];

export type SlideshowSettingsInput = {
  template: SlideshowTemplateId;
  primaryColor: string;
  background: string;
};

/**
 * Hook to fetch event slideshow settings
 */
export function useSlideshowSettings(eventId: string | undefined) {
  return useApiQuery<GetSlideshowSettingsResponse>({
    queryKey: ['events', 'detail', eventId, 'slideshow-settings'],
    apiFn: (opts) =>
      (api.events as any)[':id']['slideshow-settings'].$get(
        { param: { id: eventId! } },
        opts,
      ),
    enabled: !!eventId,
  });
}

/**
 * Hook to save event slideshow settings
 */
export function useSaveSlideshowSettings(eventId: string | undefined) {
  const queryClient = useQueryClient();

  return useApiMutation<PutSlideshowSettingsResponse, SlideshowSettingsInput>({
    apiFn: (input, opts) =>
      (api.events as any)[':id']['slideshow-settings'].$put(
        { param: { id: eventId! }, json: input },
        opts,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['events', 'detail', eventId, 'slideshow-settings'],
      });
    },
  });
}
