'use client';

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The frame every chart sits in.
 *
 * Three jobs, and each of them is about the chart library being large and
 * drawing to a canvas:
 *
 *  1. **Defer.** The plotting engine is far bigger than the rest of this
 *     application put together. Nothing on the dashboard is worth making the
 *     office wait for it, so it is not fetched until a chart is close to being
 *     looked at. The tiles above render and are readable long before.
 *
 *  2. **Reserve the space.** The frame has a fixed height from the first
 *     paint, so the page does not jump when the chart finally arrives — the
 *     classic failure of a lazily loaded widget.
 *
 *  3. **Contain the damage.** A chart that throws must leave a message in its
 *     own box. Canvas rendering fails in ways ordinary markup does not (a
 *     resize to zero, a stale context after a fast route change), and none of
 *     those are a reason for the dashboard to disappear.
 */

class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Logged, not swallowed: a chart that stops drawing should be findable.
    console.error('[chart]', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="h-full flex items-center justify-center text-[13px] text-[var(--color-muted)]">
          แสดงกราฟไม่สำเร็จ — ข้อมูลในตารางยังใช้งานได้ตามปกติ
        </div>
      );
    }
    return this.props.children;
  }
}

function Skeleton() {
  return (
    <div className="h-full flex items-end gap-2 px-2 pb-6 pt-2" aria-hidden="true">
      {[38, 62, 45, 78, 55, 88, 48].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[2px] bg-[var(--color-surface-alt)] animate-pulse"
          style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Mounts its children only once they are near the viewport.
 *
 * `rootMargin` starts the fetch before the frame is actually on screen, so in
 * normal scrolling the chart is ready by the time it arrives. Falls back to
 * mounting immediately where IntersectionObserver is missing — an old browser
 * should get a slow chart, not no chart.
 */
function WhenNearViewport({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={ref} className={className}>
      {show ? children : <Skeleton />}
    </div>
  );
}

export function ChartFrame({
  title,
  hint,
  action,
  height = 280,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  height?: number;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base">{title}</h2>
        {action}
      </div>
      {hint && <p className="text-[12px] text-[var(--color-muted)] mb-2">{hint}</p>}

      <div style={{ height }}>
        {empty ? (
          <div className="h-full flex items-center justify-center text-[13px] text-[var(--color-muted)]">
            {empty}
          </div>
        ) : (
          <ChartErrorBoundary>
            <WhenNearViewport className="h-full">{children}</WhenNearViewport>
          </ChartErrorBoundary>
        )}
      </div>
    </section>
  );
}

export { Skeleton as ChartSkeleton };
