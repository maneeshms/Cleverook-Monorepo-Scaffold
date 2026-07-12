import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM symmetric encryption for secrets stored at rest (messaging
 * provider API keys, OAuth client secrets, etc.).
 *
 * The 32-byte key is derived from a passphrase via scrypt with a fixed salt so
 * the same passphrase always yields the same key (deterministic, no separate
 * salt storage). Ciphertext layout: base64( iv(12) || authTag(16) || cipher ).
 *
 * Callers pass the passphrase (typically MESSAGING_ENCRYPTION_KEY, falling back
 * to JWT_ACCESS_SECRET). Decrypt returns null on any failure (tampered/rotated
 * key) so callers can treat "undecryptable" the same as "not configured".
 */
export class SecretCipher {
  private readonly key: Buffer;

  constructor(passphrase: string) {
    this.key = scryptSync(passphrase, 'clevscaffold-secrets-v1', 32) as Buffer;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;
    try {
      const buf = Buffer.from(ciphertext, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const data = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(data).toString('utf8') + decipher.final('utf8');
    } catch {
      return null;
    }
  }
}
