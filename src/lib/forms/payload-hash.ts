/**
 * The hash that binds a signature to what was signed.
 *
 * This lives on its own, and uses Web Crypto rather than node:crypto, because
 * BOTH sides need it: the browser computes it at the moment the customer lifts
 * their finger, and the server recomputes it over the payload it is about to
 * store. Two implementations of "the same" hash would eventually disagree —
 * and the day they disagreed, every signature would read as tampered.
 *
 * That split matters most offline. A technician signing with no signal cannot
 * ask the server for a hash, and hashing at sync time instead would bind the
 * signature to whatever the form said when the signal came back, which is
 * exactly the edit the hash exists to expose.
 */

/**
 * Serialise deterministically: keys sorted, undefined dropped.
 *
 * Key order must not change the hash, or merely re-saving unchanged content
 * would look like tampering. Array order MUST change it — the order of a parts
 * list is part of what the list says.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of the canonical serialisation. Async because Web Crypto is. */
export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

/** True when `hash` is the hash of `payload`. */
export async function payloadHashMatches(payload: unknown, hash: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return false;
  return (await payloadHash(payload)) === hash;
}
