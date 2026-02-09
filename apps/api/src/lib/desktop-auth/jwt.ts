/**
 * Desktop Auth JWT
 *
 * Access token is a short-lived JWT signed by SabaiPics.
 * Refresh token is opaque and stored hashed in DB.
 */

import { SignJWT, jwtVerify } from 'jose';

export const DESKTOP_ACCESS_TOKEN_AUDIENCE = 'desktop-api' as const;

export type DesktopAccessTokenPayload = {
  clerkUserId: string;
  desktopSessionId: string;
};

export async function signDesktopAccessToken(params: {
  secret: string;
  ttlSeconds: number;
  payload: DesktopAccessTokenPayload;
}): Promise<{ token: string; expiresAtMs: number }> {
  const { secret, ttlSeconds, payload } = params;
  const key = new TextEncoder().encode(secret);

  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const token = await new SignJWT({ sid: payload.desktopSessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.clerkUserId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAtMs / 1000))
    .setAudience(DESKTOP_ACCESS_TOKEN_AUDIENCE)
    .sign(key);

  return { token, expiresAtMs };
}

export async function verifyDesktopAccessToken(params: {
  secret: string;
  token: string;
}): Promise<DesktopAccessTokenPayload> {
  const key = new TextEncoder().encode(params.secret);

  const { payload } = await jwtVerify(params.token, key, {
    algorithms: ['HS256'],
    audience: DESKTOP_ACCESS_TOKEN_AUDIENCE,
    requiredClaims: ['sub', 'sid'],
  });

  return {
    clerkUserId: payload.sub as string,
    desktopSessionId: payload.sid as string,
  };
}
