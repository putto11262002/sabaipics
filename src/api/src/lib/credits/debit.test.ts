import { describe, it, expect, vi } from 'vitest';
import { ResultAsync } from 'neverthrow';
import { debitCreditsIfNotExists, type DebitResult, type DebitCreditsParams } from './debit';
import type { CreditError } from './error';

function makeTx(existingRows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(existingRows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return {
    tx: { select } as any,
    limit,
  };
}

function makeParams(): DebitCreditsParams {
  return {
    photographerId: 'photographer-1',
    amount: 1,
    operationType: 'image_upload',
    operationId: 'photo-1',
    source: 'upload',
  };
}

describe('credits/debitCreditsIfNotExists', () => {
  it('returns debited:false when operation already exists', async () => {
    const { tx } = makeTx([{ id: 'existing-debit' }]);
    const debitFn = vi.fn();

    const result = await debitCreditsIfNotExists(tx, makeParams(), { debitFn });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.debited).toBe(false);
    expect(result.value.debitResult).toBeNull();
    expect(debitFn).not.toHaveBeenCalled();
  });

  it('calls debitFn and returns debited:true when no existing operation', async () => {
    const { tx } = makeTx([]);
    const debitResult: DebitResult = {
      debitLedgerEntryId: 'debit-1',
      allocations: [{ creditLedgerEntryId: 'credit-1', amount: 1 }],
    };
    const debitFn = vi.fn().mockReturnValue(ResultAsync.fromSafePromise(Promise.resolve(debitResult)));

    const result = await debitCreditsIfNotExists(tx, makeParams(), { debitFn });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.debited).toBe(true);
    expect(result.value.debitResult).toEqual(debitResult);
    expect(debitFn).toHaveBeenCalledTimes(1);
  });

  it('treats unique-violation race as already debited', async () => {
    const { tx } = makeTx([]);
    const debitFn = vi.fn().mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject({ type: 'database', cause: { code: '23505' } } satisfies CreditError),
        (cause) => cause as CreditError,
      ),
    );

    const result = await debitCreditsIfNotExists(tx, makeParams(), { debitFn });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.debited).toBe(false);
    expect(result.value.debitResult).toBeNull();
  });
});
