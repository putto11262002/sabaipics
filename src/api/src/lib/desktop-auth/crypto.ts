function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomTokenBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(sig));
}
