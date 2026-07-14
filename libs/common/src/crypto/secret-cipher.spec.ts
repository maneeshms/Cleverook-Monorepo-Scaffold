import { SecretCipher } from './secret-cipher';

describe('SecretCipher', () => {
  const cipher = new SecretCipher('a-strong-passphrase');

  it('round-trips plaintext', () => {
    const secret = 'client-secret-∆-unicode';
    const encrypted = cipher.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(cipher.decrypt(encrypted)).toBe(secret);
  });

  it('produces unique ciphertexts per call (random IV)', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('returns null for null/undefined/empty ciphertext', () => {
    expect(cipher.decrypt(null)).toBeNull();
    expect(cipher.decrypt(undefined)).toBeNull();
    expect(cipher.decrypt('')).toBeNull();
  });

  it('returns null on tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = cipher.encrypt('secret');
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(cipher.decrypt(buf.toString('base64'))).toBeNull();
  });

  it('returns null when decrypting with a different passphrase (key rotation)', () => {
    const other = new SecretCipher('another-passphrase');
    expect(other.decrypt(cipher.encrypt('secret'))).toBeNull();
  });

  it('returns null on garbage input', () => {
    expect(cipher.decrypt('not-base64-ciphertext')).toBeNull();
  });

  it('refuses an empty or too-short passphrase (no silent weak-key fallback)', () => {
    expect(() => new SecretCipher('')).toThrow(/at least 16/);
    expect(() => new SecretCipher('short')).toThrow(/at least 16/);
    expect(() => new SecretCipher('   ')).toThrow(/at least 16/);
  });
});
