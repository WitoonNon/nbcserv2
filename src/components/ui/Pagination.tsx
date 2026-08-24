import Link from 'next/link';

/**
 * Numbered paging.
 *
 * Plain links, not buttons: paging must survive a page the user reached from a
 * bookmark, a shared URL, or a browser Back — and the office does share links
 * to a filtered register. That also means the current filters have to travel
 * with the page number, which is what `params` is for.
 *
 * The window keeps the first and last page always visible, so the size of the
 * list is legible at a glance without paging through it.
 */

export interface PaginationProps {
  /** 1-based. */
  page: number;
  total: number;
  perPage: number;
  /** Path the links point at, e.g. `/assets`. */
  basePath: string;
  /** Filters to carry along. Empty values are dropped. */
  params?: Record<string, string | number | undefined | null>;
  /** Query key holding the page number — a page can paginate two lists. */
  param?: string;
  /** Anchor appended to each link, so paging a table does not jump to the top. */
  hash?: string;
  /** Singular noun for the count line, e.g. 'เครื่อง'. */
  unit?: string;
}

function windowed(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const out: (number | 'gap')[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);

  if (from > 2) out.push('gap');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push('gap');
  out.push(pages);
  return out;
}

const cell =
  'inline-flex items-center justify-center min-w-9 h-9 px-2.5 rounded-[3px] text-sm ' +
  'border border-[var(--color-line)] hover:border-[var(--color-brand-blue)]';

export function Pagination({
  page,
  total,
  perPage,
  basePath,
  params = {},
  param = 'page',
  hash,
  unit,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  function href(p: number): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    // Page 1 is the bare URL: a link someone copies off the first page should
    // not carry a redundant ?page=1.
    if (p > 1) qs.set(param, String(p));
    const q = qs.toString();
    return `${basePath}${q ? `?${q}` : ''}${hash ?? ''}`;
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-[var(--color-line)]">
      <p className="text-[12px] text-[var(--color-muted)]">
        {total === 0
          ? 'ไม่พบรายการ'
          : `แสดง ${first}–${last} จาก ${total.toLocaleString('th-TH')}${unit ? ` ${unit}` : ' รายการ'}`}
      </p>

      {pages > 1 && (
        <nav className="flex items-center gap-1 flex-wrap" aria-label="แบ่งหน้า">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cell} rel="prev">
              ก่อนหน้า
            </Link>
          ) : (
            <span className={cell + ' opacity-40'}>ก่อนหน้า</span>
          )}

          {windowed(page, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap${i}`} className="px-1 text-[var(--color-muted)]">
                …
              </span>
            ) : p === page ? (
              <span
                key={p}
                aria-current="page"
                className={
                  cell +
                  ' bg-[var(--color-brand-orange)] border-[var(--color-brand-orange)] text-white font-semibold'
                }
              >
                {p}
              </span>
            ) : (
              <Link key={p} href={href(p)} className={cell}>
                {p}
              </Link>
            ),
          )}

          {page < pages ? (
            <Link href={href(page + 1)} className={cell} rel="next">
              ถัดไป
            </Link>
          ) : (
            <span className={cell + ' opacity-40'}>ถัดไป</span>
          )}
        </nav>
      )}
    </div>
  );
}

/** Clamp a `?page=` value from the URL to something a query can be run with. */
export function pageParam(raw: string | undefined, pages = Infinity): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, pages);
}
