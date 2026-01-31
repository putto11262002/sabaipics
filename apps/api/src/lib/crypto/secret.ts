const IV_SIZE_BYTES = 12;
const KEY_SIZE_BYTES = 32;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBytes = decodeBase64(keyBase64);
  if (keyBytes.length !== KEY_SIZE_BYTES) {
    throw new Error('Invalid encryption key length');
  }
  const keyBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey('raw', keyBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE_BYTES));
  const encoded = new TextEncoder().encode(value);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const cipherBytes = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipherBytes.length);
  payload.set(iv, 0);
  payload.set(cipherBytes, iv.length);
  return encodeBase64(payload);
}

export async function decryptSecret(payloadBase64: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const payload = decodeBase64(payloadBase64);
  if (payload.length <= IV_SIZE_BYTES) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = payload.slice(0, IV_SIZE_BYTES);
  const cipherBytes = payload.slice(IV_SIZE_BYTES);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuffer);
}
