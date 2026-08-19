/**
 * How a stored file is named.
 *
 * Shared by the browser and the server on purpose. A photo taken with no
 * signal has to be written into the form payload before any server has seen
 * it, so the client must be able to work out the key itself — and if the two
 * sides computed it differently, the payload would point at a file that never
 * existed under that name.
 *
 * No node imports here, for the same reason.
 */

/**
 * Every segment is attacker-influenced somewhere upstream, and the local
 * storage driver turns keys straight into filesystem paths. `..` or a stray
 * slash would write outside the storage root, so segments are reduced to a
 * safe alphabet here rather than at each call site.
 */
function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned || 'unnamed';
}

/**
 * Deterministic, collision-free key layout.
 *
 * The month folder comes from `at` in **UTC**. Both parts matter: an explicit
 * timestamp because the client computes this when the photo is taken and the
 * server when it finally arrives — hours later, possibly in a different month
 * — and UTC because the phone is on Bangkok time while the server is not.
 * Either alone would put the same file in two different folders.
 */
export function mediaKey(parts: {
  entityType: string;
  entityId: string;
  kind: string;
  filename: string;
  at?: Date;
}): string {
  const at = parts.at ?? new Date();
  const yyyymm = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  return [
    yyyymm,
    safeSegment(parts.entityType),
    safeSegment(parts.entityId),
    safeSegment(parts.kind),
    safeSegment(parts.filename),
  ].join('/');
}

/**
 * The app-relative URL a stored key is served from.
 *
 * Lives here rather than beside the storage adapter because it is pure string
 * layout with no node dependency, and the printable work order — a server
 * component that has to stay renderable in a plain DOM for testing — needs it.
 * Reaching it through the attachment service would drag prisma and the storage
 * driver along behind `server-only` for the sake of one template literal.
 *
 * Always app-relative: the route behind it re-checks who is asking, so a
 * signed URL is never minted before that check has run.
 */
export function mediaUrl(key: string): string {
  return `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** The key a work-order photograph will have, worked out before it uploads. */
export function workOrderMediaKey(params: {
  workOrderId: string;
  kind: string;
  mediaId: string;
  extension: string;
  at: Date;
}): string {
  return mediaKey({
    entityType: 'WorkOrder',
    entityId: params.workOrderId,
    kind: params.kind,
    filename: `${params.mediaId}.${params.extension}`,
    at: params.at,
  });
}
