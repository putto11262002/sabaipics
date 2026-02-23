import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type RedeemResponse = InferResponseType<
  (typeof api)['credit-packages']['redeem']['$post'],
  SuccessStatusCode
>;

export type RedeemGiftCodeInput = { code: string };
export type RedeemGiftCodeResult = RedeemResponse['data'];

export function useRedeemGiftCode() {
  const queryClient = useQueryClient();

  return useApiMutation<RedeemResponse, RedeemGiftCodeInput>({
    apiFn: (input, opts) =>
      api['credit-packages'].redeem.$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
