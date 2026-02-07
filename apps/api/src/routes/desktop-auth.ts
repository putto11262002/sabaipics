import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { desktopAuthCodes, desktopSessions } from '@sabaipics/db';
import { requireAuth } from '@sabaipics/auth/middleware';
import { ResultAsync, err, ok, safeTry } from 'neverthrow';
import { apiError, type HandlerError } from '../lib/error';
import { hmacSha256Base64Url, randomTokenBase64Url } from '../lib/desktop-auth/crypto';
import { signDesktopAccessToken } from '../lib/desktop-auth/jwt';
import type { Env } from '../types';

const AUTH_CODE_TTL_SECONDS = 120;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_ROTATION_GRACE_SECONDS = 60;

const exchangeSchema = z.object({
  deviceName: z.string().min(1).max(200).optional(),
});

const redeemSchema = z.object({
  code: z.string().min(10),
  deviceName: z.string().min(1).max(200).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

type RedeemTxResult =
  | { ok: false }
  | {
      ok: true;
      clerkUserId: string;
      desktopSessionId: string;
      refreshToken: string;
      refreshExpiresAtMs: number;
    };

type RefreshTxResult =
  | { ok: false }
  | {
      ok: true;
      clerkUserId: string;
      desktopSessionId: string;
      refreshToken: string | null;
      refreshExpiresAtMs: number;
    };

export const desktopAuthRouter = new Hono<Env>()
  .post('/exchange', requireAuth(), zValidator('json', exchangeSchema), async (c) => {
    return safeTry(async function* () {
      const auth = c.get('auth');
      if (!auth) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        });
      }

      const db = c.var.db();
      const { deviceName } = c.req.valid('json');

      const code = randomTokenBase64Url(32);
      const codeHash = yield* ResultAsync.fromPromise(
        hmacSha256Base64Url(c.env.DESKTOP_REFRESH_TOKEN_PEPPER, code),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate code',
          cause: e,
        }),
      );

      const expiresAtMs = Date.now() + AUTH_CODE_TTL_SECONDS * 1000;
      const expiresAtIso = new Date(expiresAtMs).toISOString();

      yield* ResultAsync.fromPromise(
        db.insert(desktopAuthCodes).values({
          codeHash,
          clerkUserId: auth.userId,
          deviceName: deviceName ?? null,
          expiresAt: expiresAtIso,
        }),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to store code',
          cause: e,
        }),
      );

      return ok({ code, expiresAt: expiresAtMs });
    })
      .orTee((e) => e.cause && console.error('[desktop-auth/exchange]', e.code + ':', e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })
  .post('/redeem', zValidator('json', redeemSchema), async (c) => {
    return safeTry(async function* () {
      const { code, deviceName } = c.req.valid('json');

      const codeHash = yield* ResultAsync.fromPromise(
        hmacSha256Base64Url(c.env.DESKTOP_REFRESH_TOKEN_PEPPER, code),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to redeem code',
          cause: e,
        }),
      );

      const dbTx = c.var.dbTx();

      const result = (yield* ResultAsync.fromPromise(
        dbTx.transaction(async (tx: any) => {
          const [row] = await tx
            .select({
              id: desktopAuthCodes.id,
              clerkUserId: desktopAuthCodes.clerkUserId,
              deviceName: desktopAuthCodes.deviceName,
            })
            .from(desktopAuthCodes)
            .where(
              and(
                eq(desktopAuthCodes.codeHash, codeHash),
                isNull(desktopAuthCodes.usedAt),
                gt(desktopAuthCodes.expiresAt, sql`NOW()`),
              ),
            )
            .limit(1);

          if (!row) {
            return { ok: false as const };
          }

          // Mark code used (race-safe)
          const used = await tx
            .update(desktopAuthCodes)
            .set({ usedAt: sql`NOW()` })
            .where(and(eq(desktopAuthCodes.id, row.id), isNull(desktopAuthCodes.usedAt)))
            .returning({ id: desktopAuthCodes.id });

          if (used.length === 0) {
            return { ok: false as const };
          }

          const refreshToken = randomTokenBase64Url(48);
          const refreshTokenHash = await hmacSha256Base64Url(
            c.env.DESKTOP_REFRESH_TOKEN_PEPPER,
            refreshToken,
          );

          const refreshExpiresAtMs = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000;
          const refreshExpiresAtIso = new Date(refreshExpiresAtMs).toISOString();

          const [session] = await tx
            .insert(desktopSessions)
            .values({
              clerkUserId: row.clerkUserId,
              refreshTokenHash,
              deviceName: deviceName ?? row.deviceName ?? null,
              lastUsedAt: new Date().toISOString(),
              expiresAt: refreshExpiresAtIso,
            })
            .returning({ id: desktopSessions.id });

          if (!session?.id) {
            throw new Error('Failed to create desktop session');
          }

          return {
            ok: true as const,
            clerkUserId: row.clerkUserId,
            desktopSessionId: session.id as string,
            refreshToken,
            refreshExpiresAtMs,
          };
        }),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to redeem code',
          cause: e,
        }),
      )) as RedeemTxResult;

      if (!result.ok) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired code',
        });
      }

      const access = yield* ResultAsync.fromPromise(
        signDesktopAccessToken({
          secret: c.env.DESKTOP_ACCESS_JWT_SECRET,
          ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
          payload: {
            clerkUserId: result.clerkUserId,
            desktopSessionId: result.desktopSessionId,
          },
        }),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to mint access token',
          cause: e,
        }),
      );

      return ok({
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAtMs,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshExpiresAtMs,
      });
    })
      .orTee((e) => e.cause && console.error('[desktop-auth/redeem]', e.code + ':', e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })
  .post('/refresh', zValidator('json', refreshSchema), async (c) => {
    return safeTry(async function* () {
      const { refreshToken } = c.req.valid('json');
      const refreshTokenHash = yield* ResultAsync.fromPromise(
        hmacSha256Base64Url(c.env.DESKTOP_REFRESH_TOKEN_PEPPER, refreshToken),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to refresh', cause: e }),
      );

      const dbTx = c.var.dbTx();

      const rotated = (yield* ResultAsync.fromPromise(
        dbTx.transaction(async (tx: any) => {
          const [session] = await tx
            .select({
              id: desktopSessions.id,
              clerkUserId: desktopSessions.clerkUserId,
              refreshTokenHash: desktopSessions.refreshTokenHash,
              refreshTokenHashPrev: desktopSessions.refreshTokenHashPrev,
              refreshTokenPrevExpiresAt: desktopSessions.refreshTokenPrevExpiresAt,
              expiresAt: desktopSessions.expiresAt,
            })
            .from(desktopSessions)
            .where(
              and(
                isNull(desktopSessions.revokedAt),
                gt(desktopSessions.expiresAt, sql`NOW()`),
                or(
                  eq(desktopSessions.refreshTokenHash, refreshTokenHash),
                  and(
                    eq(desktopSessions.refreshTokenHashPrev, refreshTokenHash),
                    gt(desktopSessions.refreshTokenPrevExpiresAt, sql`NOW()`),
                  ),
                ),
              ),
            )
            .limit(1);

          if (!session?.id) {
            return { ok: false as const };
          }

          // If the request matched the previous (grace) token, do NOT rotate again.
          // This prevents a late retry from invalidating the just-issued current token.
          if (session.refreshTokenHashPrev && session.refreshTokenHashPrev === refreshTokenHash) {
            return {
              ok: true as const,
              clerkUserId: session.clerkUserId as string,
              desktopSessionId: session.id as string,
              refreshToken: null,
              refreshExpiresAtMs: new Date(session.expiresAt as string).getTime(),
            };
          }

          const newRefreshToken = randomTokenBase64Url(48);
          const newRefreshTokenHash = await hmacSha256Base64Url(
            c.env.DESKTOP_REFRESH_TOKEN_PEPPER,
            newRefreshToken,
          );

          const graceExpiresAtIso = new Date(
            Date.now() + REFRESH_ROTATION_GRACE_SECONDS * 1000,
          ).toISOString();
          const refreshExpiresAtMs = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000;
          const refreshExpiresAtIso = new Date(refreshExpiresAtMs).toISOString();

          await tx
            .update(desktopSessions)
            .set({
              refreshTokenHashPrev: session.refreshTokenHash,
              refreshTokenPrevExpiresAt: graceExpiresAtIso,
              refreshTokenHash: newRefreshTokenHash,
              lastUsedAt: sql`NOW()`,
              expiresAt: refreshExpiresAtIso,
            })
            .where(eq(desktopSessions.id, session.id));

          return {
            ok: true as const,
            clerkUserId: session.clerkUserId as string,
            desktopSessionId: session.id as string,
            refreshToken: newRefreshToken,
            refreshExpiresAtMs,
          };
        }),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to refresh', cause: e }),
      )) as RefreshTxResult;

      if (!rotated.ok) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired refresh token',
        });
      }

      const access = yield* ResultAsync.fromPromise(
        signDesktopAccessToken({
          secret: c.env.DESKTOP_ACCESS_JWT_SECRET,
          ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
          payload: {
            clerkUserId: rotated.clerkUserId,
            desktopSessionId: rotated.desktopSessionId,
          },
        }),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to mint access token',
          cause: e,
        }),
      );

      return ok({
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAtMs,
        refreshToken: rotated.refreshToken,
        refreshTokenExpiresAt: rotated.refreshExpiresAtMs,
        refreshTokenUnchanged: rotated.refreshToken === null,
      });
    })
      .orTee((e) => e.cause && console.error('[desktop-auth/refresh]', e.code + ':', e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })
  .post('/revoke', zValidator('json', refreshSchema), async (c) => {
    return safeTry(async function* () {
      const { refreshToken } = c.req.valid('json');
      const refreshTokenHash = yield* ResultAsync.fromPromise(
        hmacSha256Base64Url(c.env.DESKTOP_REFRESH_TOKEN_PEPPER, refreshToken),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to revoke', cause: e }),
      );

      const db = c.var.db();

      const updated = (yield* ResultAsync.fromPromise(
        db
          .update(desktopSessions)
          .set({ revokedAt: sql`NOW()` })
          .where(
            and(
              isNull(desktopSessions.revokedAt),
              or(
                eq(desktopSessions.refreshTokenHash, refreshTokenHash),
                eq(desktopSessions.refreshTokenHashPrev, refreshTokenHash),
              ),
            ),
          )
          .returning({ id: desktopSessions.id }),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to revoke', cause: e }),
      )) as Array<{ id: string }>;

      if (updated.length === 0) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Invalid refresh token',
        });
      }

      return ok(null);
    })
      .orTee((e) => e.cause && console.error('[desktop-auth/revoke]', e.code + ':', e.cause))
      .match(
        () => c.body(null, 204),
        (e) => apiError(c, e),
      );
  });
