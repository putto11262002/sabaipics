import { hashPassword } from '../password';
import { encryptSecret } from '../crypto/secret';

export interface FtpCredentialsPayload {
  username: string;
  password: string;
  passwordHash: string;
  passwordCiphertext: string;
}

export async function generateFtpCredentials(
  encryptionKey: string,
): Promise<FtpCredentialsPayload> {
  const shortId = crypto.randomUUID().slice(0, 8);
  const username = `evt-${shortId}`;
  const password = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const passwordCiphertext = await encryptSecret(password, encryptionKey);

  return {
    username,
    password,
    passwordHash,
    passwordCiphertext,
  };
}
