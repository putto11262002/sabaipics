/**
 * Participant Session Middleware
 *
 * Reads session token from cookie, resolves session from DB.
 * If no cookie or expired: creates new session, sets cookie.
 * Sets `participantSession` on Hono context.
 */

import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { activeParticipantSessions, participantSessions } from '@/db';
import type { Env } from '../types';

const COOKIE_NAME = 'ff_session';
const SESSION_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months
const COOKIE_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000); // in seconds

/** Generate a cryptographically random token (base64url, 32 bytes). */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url encoding (no padding)
  return btoa(String.fromCharCode.apply(null, Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Parse cookies from Cookie header. */
function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  }
  return cookies;
}

export type ParticipantSessionContext = {
  id: string;
  token: string;
  lineUserId: string | null;
  isFriend: boolean;
  consentAcceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export const participantSessionMiddleware = () =>
  createMiddleware<Env>(async (c, next) => {
    const db = c.var.db();
    const cookies = parseCookies(c.req.header('Cookie'));
    const token = cookies[COOKIE_NAME];

    let session: ParticipantSessionContext | null = null;

    // Try to resolve existing session
    if (token) {
      const [existing] = await db
        .select({
          id: activeParticipantSessions.id,
          token: activeParticipantSessions.token,
          lineUserId: activeParticipantSessions.lineUserId,
          isFriend: activeParticipantSessions.isFriend,
          consentAcceptedAt: activeParticipantSessions.consentAcceptedAt,
          expiresAt: activeParticipantSessions.expiresAt,
          createdAt: activeParticipantSessions.createdAt,
        })
        .from(activeParticipantSessions)
        .where(eq(activeParticipantSessions.token, token))
        .limit(1);

      if (existing) {
        session = existing;
      }
    }

    // Create new session if none found
    if (!session) {
      const newToken = generateToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

      const [created] = await db
        .insert(participantSessions)
        .values({ token: newToken, expiresAt })
        .returning({
          id: participantSessions.id,
          token: participantSessions.token,
          lineUserId: participantSessions.lineUserId,
          isFriend: participantSessions.isFriend,
          consentAcceptedAt: participantSessions.consentAcceptedAt,
          expiresAt: participantSessions.expiresAt,
          createdAt: participantSessions.createdAt,
        });

      session = created;

      // Set cookie on response
      setCookie(c, newToken);
    }

    c.set('participantSession', session);
    await next();
  });

/** Set the session cookie on the response. */
export function setCookie(c: { header: (name: string, value: string) => void }, token: string) {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`,
  );
}

/** Extend an existing session's expiration. */
export async function extendSession(
  db: ReturnType<Env['Variables']['db']>,
  sessionId: string,
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db
    .update(participantSessions)
    .set({ expiresAt })
    .where(eq(participantSessions.id, sessionId));
  return expiresAt;
}
