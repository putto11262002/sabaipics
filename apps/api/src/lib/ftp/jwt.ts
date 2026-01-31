/**
 * FTP JWT Token Management
 *
 * Uses jose library (v6.x) for CF Workers compatibility.
 * Algorithm: HS256 (symmetric HMAC-SHA256)
 * TTL: 12 hours
 * Audience: 'ftp-upload' (prevents reuse on Clerk routes)
 */

import { SignJWT, jwtVerify } from 'jose';

export interface FtpTokenPayload {
  eventId: string;
  photographerId: string;
}

/**
 * Sign a new FTP JWT token
 * @param secret The FTP_JWT_SECRET (or FTP_JWT_SECRET_PREVIOUS for old token signing)
 * @param payload Token payload
 * @returns Signed JWT token string
 */
export async function signFtpToken(secret: string, payload: FtpTokenPayload): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    eventId: payload.eventId,
    photographerId: payload.photographerId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.photographerId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .setAudience('ftp-upload')
    .sign(key);
}

/**
 * Verify an FTP JWT token
 * Supports key rotation: verify against current secret first, then previous secret
 * @param secret The FTP_JWT_SECRET
 * @param token The JWT token to verify
 * @param previousSecret Optional previous secret for key rotation
 * @returns Verified token payload
 * @throws If token is invalid, expired, or has wrong audience
 */
export async function verifyFtpToken(
  secret: string,
  token: string,
  previousSecret?: string,
): Promise<FtpTokenPayload> {
  const key = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      audience: 'ftp-upload',
      requiredClaims: ['eventId', 'photographerId'],
    });

    return {
      eventId: payload.eventId as string,
      photographerId: payload.photographerId as string,
    };
  } catch (error) {
    // If current key fails and we have a previous key, try that
    if (previousSecret && error instanceof Error) {
      const previousKey = new TextEncoder().encode(previousSecret);
      const { payload } = await jwtVerify(token, previousKey, {
        algorithms: ['HS256'],
        audience: 'ftp-upload',
        requiredClaims: ['eventId', 'photographerId'],
      });

      return {
        eventId: payload.eventId as string,
        photographerId: payload.photographerId as string,
      };
    }
    throw error;
  }
}
