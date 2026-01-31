import { encryptSecret } from '../crypto/secret';
import { hashPassword } from '../password';

export interface FtpCredentialsPayload {
  username: string;
  password: string;
  passwordHash: string;
  passwordCiphertext: string;
}

const USERNAME_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_DIGITS = 6;
const USERNAME_SUFFIX_LENGTH = 5;

function randomBase32(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const chars: string[] = [];

  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % USERNAME_CHARS.length;
    chars.push(USERNAME_CHARS[index]);
  }

  return chars.join('');
}

function randomNumericCode(length: number): string {
  const max = 10 ** length;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const value = bytes[0] % max;
  return value.toString().padStart(length, '0');
}

export async function generateFtpCredentials(
  encryptionKey: string,
): Promise<FtpCredentialsPayload> {
  const username = randomBase32(USERNAME_SUFFIX_LENGTH);
  const password = randomNumericCode(PASSWORD_DIGITS);
  const passwordHash = await hashPassword(password);
  const passwordCiphertext = await encryptSecret(password, encryptionKey);

  return {
    username,
    password,
    passwordHash,
    passwordCiphertext,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { code?: string; cause?: { code?: string }; message?: string };
  if (err.code === '23505' || err.cause?.code === '23505') {
    return true;
  }

  if (typeof err.message === 'string' && err.message.toLowerCase().includes('unique')) {
    return true;
  }

  return false;
}

export async function createFtpCredentialsWithRetry<T>(
  encryptionKey: string,
  insertFn: (payload: FtpCredentialsPayload) => Promise<T>,
  maxAttempts = 5,
): Promise<{ payload: FtpCredentialsPayload; result: T }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const payload = await generateFtpCredentials(encryptionKey);
    try {
      const result = await insertFn(payload);
      return { payload, result };
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}
