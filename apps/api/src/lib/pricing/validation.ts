import { z } from 'zod';

export const topUpSchema = z.object({
  amount: z
    .number()
    .min(50, 'Minimum top-up is 50 THB')
    .max(10000, 'Maximum top-up is 10,000 THB')
    .int('Amount must be a whole number'),
});

export type TopUpRequest = z.infer<typeof topUpSchema>;
