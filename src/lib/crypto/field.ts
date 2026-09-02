import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Encryption for the two columns that must never sit in the clear: a national
 * ID number and a bank account number.
 *
 * Everything else in this database is commercial information — job numbers,
 * prices, a customer's address. These two are different in kind. A national ID
 * plus a bank account is enough material for identity fraud against the
 * company's own staff, and the damage is not undone by changing a password.
 *
 * AES-256-GCM, not CBC: GCM authenticates as well as encrypts, so a value
 * altered in the database fails to decrypt rather than decrypting to something
 * else. The IV is random per value and stored alongside — reusing an IV under
 * one key is the classic way to make GCM leak.
 *
 * Format: `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`. Versioned from the start
 * so the scheme can be replaced later without guessing what old rows are.
 *
 * The key comes from FIELD_ENCRYPTION_KEY and lives nowhere else — not in the
 * repository, not in a migration, not in a seed. A backup of the database
 * alone therefore does not disclose these columns, which is the entire point.
 */

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

export class FieldCryptoError extends Error {}

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new FieldCryptoError(
      'FIELD_ENCRYPTION_KEY is not set — refusing to store personal data unencrypted',
    );
  }

  // Accept a 32-byte key as base64 or hex; derive from a passphrase otherwise.
  // A passphrase is the weaker option and is allowed only so a misconfigured
  // deployment fails safe rather than failing open.
  let k: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) k = Buffer.from(raw, 'hex');
  else {
    const b = Buffer.from(raw, 'base64');
    k = b.length === 32 ? b : createHash('sha256').update(raw, 'utf8').digest();
  }

  if (k.length !== 32) throw new FieldCryptoError('FIELD_ENCRYPTION_KEY must resolve to 32 bytes');
  cachedKey = k;
  return k;
}

/** Test seam — the key is cached, and a test that changes the env needs it dropped. */
export function resetFieldKey(): void {
  cachedKey = null;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12); // 96 bits, the size GCM is defined for
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptField(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new FieldCryptoError('unrecognised ciphertext format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  // Throws if the value was tampered with — which is the behaviour we want.
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Null-tolerant wrappers: most of these columns are optional. */
export function encryptOptional(plain: string | null | undefined): string | null {
  const v = plain?.trim();
  return v ? encryptField(v) : null;
}

export function decryptOptional(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decryptField(stored);
  } catch {
    // A row that cannot be decrypted must not take the screen down — the rest
    // of the personnel file is still readable and still useful.
    return null;
  }
}

/** Digits only, so formatting differences do not change what is stored. */
export function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

export function last4(v: string): string | null {
  const d = digitsOnly(v);
  return d.length >= 4 ? d.slice(-4) : null;
}

/**
 * Thai national ID check digit.
 *
 * Worth validating because the number is about to be encrypted: once stored,
 * nobody can eyeball it to spot the typo, and it is exactly the field a
 * payroll or tax filing will later be rejected on.
 */
export function isValidThaiNationalId(v: string): boolean {
  const d = digitsOnly(v);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/**
 * The first digit says which population the number was issued to. 1–5 are the
 * categories for Thai citizens; 6, 7 and 8 are issued to non-citizens.
 */
function isCitizenPrefix(d: string): boolean {
  return d[0] !== undefined && d[0] >= '1' && d[0] <= '5';
}

/**
 * The identity number as the register actually has to accept it.
 *
 * The check digit above is the right test for a Thai citizen's card and the
 * wrong test for everyone else. The client employs migrant workers and typed
 * the 13-digit number straight off a work permit; it failed, and the system
 * told the owner of a government document that the government's number was
 * invalid. That is the system being wrong, and no setting could have fixed it.
 *
 * So the check digit is applied only to citizen prefixes, where it is known to
 * hold and where nearly every record will fall. For 6/7/8 the length is all
 * that is checked — the schemes behind those numbers are not ones this code
 * can verify, and refusing what it cannot verify is worse than accepting it.
 *
 * The cost is real and worth stating: a mistyped digit in a foreign worker's
 * number will be stored. Length still catches the common slip (a dropped or
 * doubled digit), and `nationalIdLast4` stays readable for checking against
 * the document later.
 */
export function isValidIdNumber(v: string): boolean {
  const d = digitsOnly(v);
  if (d.length !== 13) return false;
  return isCitizenPrefix(d) ? isValidThaiNationalId(d) : true;
}
