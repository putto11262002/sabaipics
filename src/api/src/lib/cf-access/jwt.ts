/**
 * Cloudflare Access JWT Verification
 *
 * Uses jose library (v6.x) for CF Workers compatibility.
 * Algorithm: RS256 (asymmetric, JWKS-fetched public keys)
 * Issuer: CF Access team domain
 * Audience: Application AUD tag from CF Access dashboard
 *
 * Reference: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface CfAccessPayload {
  email: string;
  sub: string;
}

/**
 * Verify a Cloudflare Access JWT token.
 *
 * @param token - The JWT from the `Cf-Access-Jwt-Assertion` header
 * @param teamDomain - CF Access team domain (e.g. `https://myteam.cloudflareaccess.com`)
 * @param aud - Application AUD tag from CF Access dashboard
 * @returns Verified payload with `email` and `sub`
 * @throws If token is invalid, expired, or has wrong issuer/audience
 */
export async function verifyCfAccessToken(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<CfAccessPayload> {
  const jwksUrl = new URL('/cdn-cgi/access/certs', teamDomain);
  const jwks = createRemoteJWKSet(jwksUrl);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: teamDomain,
    audience: aud,
  });

  return {
    email: payload.email as string,
    sub: payload.sub as string,
  };
}
