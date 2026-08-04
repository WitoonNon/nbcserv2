import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing.
 *
 * scrypt from Node core — no native bcrypt dependency to break on deploy.
 * Format: scrypt$<salt-hex>$<key-hex>, so the algorithm is self-describing and
 * a future migration to argon2 can detect and re-hash on next login.
 */
const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(plain, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;

  const expected = Buffer.from(key, 'hex');
  const actual = scryptSync(plain, salt, KEYLEN);
  // Constant-time compare so response timing does not leak the hash.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
