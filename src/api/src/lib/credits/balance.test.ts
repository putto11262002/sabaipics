import { describe, expect, it, vi } from 'vitest';
import { getBalance, recomputeBalanceCache } from './balance';

function createSelectChain<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const whereResult = Promise.resolve(rows) as Promise<T[]> & { limit: typeof limit };
  whereResult.limit = limit;
  const where = vi.fn().mockReturnValue(whereResult);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

describe('credits/balance', () => {
  it('returns cached photographer balance when invalidate timestamp is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const firstSelect = createSelectChain([{ balance: 12, balanceInvalidateAt: future }]);

    const db = {
      select: vi.fn().mockReturnValue(firstSelect),
      update: vi.fn(),
    } as unknown as Parameters<typeof getBalance>[0];

    const result = await getBalance(db, 'photographer-1');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(12);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns cached photographer balance when invalidate timestamp is null', async () => {
    const firstSelect = createSelectChain([{ balance: 0, balanceInvalidateAt: null }]);

    const db = {
      select: vi.fn().mockReturnValue(firstSelect),
      update: vi.fn(),
    } as unknown as Parameters<typeof getBalance>[0];

    const result = await getBalance(db, 'photographer-null');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('recomputes and updates cache when invalidate timestamp has passed', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const next = new Date(Date.now() + 3_600_000).toISOString();

    const photographerSelect = createSelectChain([{ balance: 99, balanceInvalidateAt: past }]);
    const aggregateSelect = createSelectChain([{ balance: 7, invalidateAt: next }]);

    const updateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'photographer-2' }]),
    });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      select: vi.fn().mockReturnValueOnce(photographerSelect).mockReturnValueOnce(aggregateSelect),
      update,
    } as unknown as Parameters<typeof getBalance>[0];

    const result = await getBalance(db, 'photographer-2');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(7);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns 0 for missing photographer row', async () => {
    const firstSelect = createSelectChain([]);
    const db = {
      select: vi.fn().mockReturnValue(firstSelect),
      update: vi.fn(),
    } as unknown as Parameters<typeof getBalance>[0];

    const result = await getBalance(db, 'missing');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('recomputeBalanceCache persists recomputed values', async () => {
    const next = new Date(Date.now() + 7_200_000).toISOString();
    const aggregateSelect = createSelectChain([{ balance: 18, invalidateAt: next }]);

    const updateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'photographer-3' }]),
    });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      select: vi.fn().mockReturnValue(aggregateSelect),
      update,
    } as unknown as Parameters<typeof recomputeBalanceCache>[0];

    const result = await recomputeBalanceCache(db, 'photographer-3');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ balance: 18, invalidateAt: next });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('recomputeBalanceCache falls back to fresh photographer row when conditional update loses race', async () => {
    const next = new Date(Date.now() + 3_600_000).toISOString();
    const stale = new Date(Date.now() - 3_600_000).toISOString();

    const aggregateSelect = createSelectChain([{ balance: 7, invalidateAt: next }]);
    const freshRowSelect = createSelectChain([{ balance: 13, balanceInvalidateAt: next }]);

    const updateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      select: vi.fn().mockReturnValueOnce(aggregateSelect).mockReturnValueOnce(freshRowSelect),
      update,
    } as unknown as Parameters<typeof recomputeBalanceCache>[0];

    const result = await recomputeBalanceCache(db, 'photographer-race', stale);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ balance: 13, invalidateAt: next });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
