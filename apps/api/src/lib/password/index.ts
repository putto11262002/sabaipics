/**
 * FTP Password Hashing
 *
 * Uses Web Crypto API with SHA-256 and random salt.
 * Passwords are stored as "salt:hash" (both hex-encoded).
 */

/**
 * Hash a password with a random salt
 * @param password The plaintext password to hash
 * @returns "salt:hash" format (hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const combined = salt + password;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 * @param storedHash The stored "salt:hash" format
 * @param candidatePassword The plaintext password to verify
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(
  storedHash: string,
  candidatePassword: string,
): Promise<boolean> {
  const [salt, storedHashValue] = storedHash.split(':');
  if (!salt || !storedHashValue) {
    return false;
  }

  const combined = salt + candidatePassword;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return computedHash === storedHashValue;
}
