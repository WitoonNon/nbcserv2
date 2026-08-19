'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Opens the browser's print dialog — but not until the page is actually ready
 * to be printed.
 *
 * `window.print()` snapshots the document as it stands at the moment it is
 * called. It does not wait for anything. Two things are typically still in
 * flight on this page and both fail silently:
 *
 *  - **Webfonts.** Sarabun is self-hosted with `display: swap`, so the first
 *    paint uses the fallback face. Printing then produces a PDF set in
 *    Leelawadee or Tahoma, where Thai tone marks sit at the wrong height above
 *    the vowels. Nobody notices until a customer has the paper.
 *
 *  - **Photographs.** They are served through /api/media, which on Supabase
 *    answers with a redirect to a signed URL. Printing before they decode
 *    gives a work order whose photo frames are blank — and a blank frame reads
 *    as "the technician took no photograph", which is a claim about their work.
 *
 * So both are awaited first. `decode()` rejects for a broken image; that is
 * caught, because one unreachable photograph must not stop the other nine from
 * being printed.
 */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  const [preparing, setPreparing] = useState(false);

  const print = useCallback(async () => {
    setPreparing(true);
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => img.decode().catch(() => undefined)),
      );
      window.print();
    } finally {
      setPreparing(false);
    }
  }, []);

  // `?auto=1` — for a link that should go straight to the print dialog. The
  // bare URL stays viewable, so the document can be checked before it is sent
  // to a customer.
  useEffect(() => {
    if (auto) void print();
  }, [auto, print]);

  return (
    <button type="button" className="printbar__btn" onClick={print} disabled={preparing}>
      {preparing ? 'กำลังเตรียมเอกสาร…' : 'พิมพ์ / บันทึกเป็น PDF'}
    </button>
  );
}
