/**
 * LINE Login OAuth 2.1 Helpers
 *
 * Handles the LINE Login OAuth flow for participant authentication.
 * Uses the LINE Login channel (separate from the Messaging API channel).
 */

import { ResultAsync } from 'neverthrow';

export interface LineLoginConfig {
  channelId: string;
  channelSecret: string;
}

export interface BuildLoginUrlParams {
  channelId: string;
  redirectUri: string;
  state: string;
}

export interface ExchangeTokenParams {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
}

export interface LineTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token: string;
}

export interface LineIdTokenPayload {
  iss: string;
  sub: string; // LINE userId
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  picture?: string;
}

export type LineLoginError = { type: 'line_login'; message: string; cause?: unknown };

/**
 * Build LINE Login authorization URL.
 *
 * Requests `profile openid` scopes and uses `bot_prompt=aggressive`
 * to prompt the user to add the Official Account as a friend.
 */
export function buildLineLoginUrl({ channelId, redirectUri, state }: BuildLoginUrlParams): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  });

  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 *
 * POST to LINE token endpoint with the code received from the callback.
 */
export function exchangeCodeForToken(
  params: ExchangeTokenParams,
): ResultAsync<LineTokenResponse, LineLoginError> {
  return ResultAsync.fromPromise(
    (async () => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: params.channelId,
        client_secret: params.channelSecret,
      });

      const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LINE token exchange failed (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as LineTokenResponse;
    })(),
    (cause): LineLoginError => ({
      type: 'line_login',
      message: 'Failed to exchange LINE authorization code',
      cause,
    }),
  );
}

/**
 * Verify ID token and extract LINE userId.
 *
 * POST to LINE verify endpoint with the ID token.
 * Returns the `sub` claim which is the LINE userId.
 */
export function verifyIdToken(
  idToken: string,
  channelId: string,
): ResultAsync<LineIdTokenPayload, LineLoginError> {
  return ResultAsync.fromPromise(
    (async () => {
      const body = new URLSearchParams({
        id_token: idToken,
        client_id: channelId,
      });

      const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LINE ID token verification failed (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as LineIdTokenPayload;
    })(),
    (cause): LineLoginError => ({
      type: 'line_login',
      message: 'Failed to verify LINE ID token',
      cause,
    }),
  );
}

/**
 * Check if the user has added the Official Account as a friend.
 */
export function checkFriendship(
  accessToken: string,
): ResultAsync<boolean, LineLoginError> {
  return ResultAsync.fromPromise(
    (async () => {
      const response = await fetch('https://api.line.me/friendship/v1/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LINE friendship check failed (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as { friendFlag: boolean };
      return data.friendFlag;
    })(),
    (cause): LineLoginError => ({
      type: 'line_login',
      message: 'Failed to check LINE friendship status',
      cause,
    }),
  );
}
