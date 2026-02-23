/**
 * Credit Grant Operation
 *
 * Adds credits to a photographer's balance via the credit ledger.
 * Must run inside an existing database transaction.
 */

import type { Transaction } from '@/db';
import { creditLedger, photographers } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';

export interface GrantCreditsParams {
  photographerId: string;
  amount: number;
  source: 'purchase' | 'gift' | 'discount' | 'refund' | 'admin_adjustment' | 'apple_purchase';
  expiresAt: string;
  stripeSessionId?: string | null;
  appleTransactionId?: string | null;
  promoCode?: string | null;
}

export interface GrantResult {
  ledgerEntryId: string;
}

/**
 * Grant credits to a photographer within an existing transaction.
 *
 * Steps:
 * 1. Insert credit_ledger row with type 'credit', remainingCredits = amount
 * 2. UPDATE photographers SET balance = balance + amount
 *
 * Callers are responsible for idempotency checks (e.g. checking for
 * duplicate stripeSessionId) before calling this function.
 */
export function grantCredits(
  tx: Transaction,
  params: GrantCreditsParams,
): ResultAsync<GrantResult, CreditError> {
  const {
    photographerId,
    amount,
    source,
    expiresAt,
    stripeSessionId = null,
    appleTransactionId = null,
    promoCode = null,
  } = params;

  return ResultAsync.fromPromise(
    (async () => {
      // Step 1: Insert credit_ledger row
      const [entry] = await tx.insert(creditLedger).values({
        photographerId,
        amount,
        type: 'credit',
        source,
        remainingCredits: amount,
        promoCode,
        stripeSessionId,
        appleTransactionId,
        expiresAt,
      }).returning({ id: creditLedger.id });

      // Step 2: Increment denormalized balance on photographer
      await tx
        .update(photographers)
        .set({ balance: sql`${photographers.balance} + ${amount}` })
        .where(eq(photographers.id, photographerId));

      return { ledgerEntryId: entry.id };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}
