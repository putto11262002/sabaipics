import { api } from '@/dashboard/src/lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '../use-api-mutation';

type SubmitFeedbackResponse = InferResponseType<typeof api.feedback.$post, SuccessStatusCode>;

export type SubmitFeedbackInput = {
  content: string;
  category?: 'suggestion' | 'feature_request' | 'general';
  source: 'dashboard' | 'event_app' | 'ios';
  eventId?: string;
};

export function useSubmitFeedback() {
  return useApiMutation<SubmitFeedbackResponse, SubmitFeedbackInput>({
    apiFn: (input, opts) => api.feedback.$post({ json: input }, opts),
  });
}
