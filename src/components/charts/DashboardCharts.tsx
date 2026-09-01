'use client';

import dynamic from 'next/dynamic';
import { ChartFrame, ChartSkeleton } from './ChartFrame';
import { AXIS_STYLE, BRAND, CATEGORY_COLOR, CHART_FONT, LEGEND_STYLE, STATUS_COLOR } from './theme';
import type { LoadPoint, MonthPoint, StatusSlice } from '@/modules/reports/dashboard.service';

/**
 * The dashboard's charts, drawn with @ant-design/plots.
 *
 * `ssr: false` is not a preference. The plotting engine measures a DOM node
 * and draws to a canvas, so rendering it on the server produces markup that is
 * thrown away and replaced on hydration — paid for twice and shown once. The
 * charts are client-only and deferred behind ChartFrame; the server sends the
 * aggregated numbers and nothing else.
 *
 * `@ant-design/plots` rather than `@ant-design/charts`: the latter always
 * pulls @ant-design/graphs (the G6 network-graph engine) alongside it, and no
 * chart on this page is a network graph.
 *
 * Only two plot types are used, both of them intervals or arcs on a single
 * scale. Nothing here is a dual-axis chart — see UpcomingLoadChart for why
 * that matters.
 */

const loading = () => <ChartSkeleton />;

const Column = dynamic(() => import('@ant-design/plots').then((m) => m.Column), {
  ssr: false,
  loading,
});
const Pie = dynamic(() => import('@ant-design/plots').then((m) => m.Pie), {
  ssr: false,
  loading,
});

const TOOLTIP_STYLE = { fontFamily: CHART_FONT } as const;

/**
 * Colours pinned by name.
 *
 * `palette` assigns colours in the order categories happen to appear in the
 * data, so a quiet month for one category silently hands its colour to the
 * next one along and the reader misreads the chart. A domain/range pair binds
 * each name to its colour for good.
 */
function pinned(names: string[], lookup: Record<string, string>) {
  return {
    color: {
      domain: names,
      range: names.map((n) => lookup[n] ?? BRAND.muted),
    },
  };
}

const CATEGORY_ORDER = ['ล้างแอร์/PM', 'ซ่อม', 'ตรวจเช็ค', 'ติดตั้ง'];

export function JobsByMonthChart({ data }: { data: MonthPoint[] }) {
  const total = data.reduce((n, d) => n + d.jobs, 0);

  return (
    <ChartFrame
      title="งานย้อนหลัง 12 เดือน"
      hint="แยกตามประเภทงาน — ใช้ดูฤดูกาลว่าเดือนไหนงานล้างเข้ามาก เพื่อวางกำลังช่างล่วงหน้า"
      empty={total === 0 ? 'ยังไม่มีงานในรอบ 12 เดือน' : undefined}
      height={300}
      // First chart on the page, always above the fold — fetching the engine
      // when it scrolls into view would only add a beat to a certain download.
      eager
    >
      <Column
        autoFit
        data={data}
        xField="month"
        yField="jobs"
        colorField="category"
        stack
        scale={pinned(CATEGORY_ORDER, CATEGORY_COLOR)}
        style={{ radiusTopLeft: 2, radiusTopRight: 2 }}
        axis={{
          x: { ...AXIS_STYLE, title: null },
          y: { ...AXIS_STYLE, title: null },
        }}
        legend={{
          color: { position: 'top', layout: { justifyContent: 'flex-end' }, ...LEGEND_STYLE },
        }}
        tooltip={{ title: (d: MonthPoint) => d.month }}
        interaction={{ tooltip: { css: TOOLTIP_STYLE } }}
        animate={{ enter: { duration: 300 } }}
      />
    </ChartFrame>
  );
}

export function JobStatusChart({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((n, d) => n + d.jobs, 0);
  const labels = data.map((d) => d.label);

  return (
    <ChartFrame
      title="งานที่ยังไม่ปิด"
      hint={total > 0 ? `รวม ${total} งานอยู่ในระบบตอนนี้` : undefined}
      empty={total === 0 ? 'ไม่มีงานค้างในระบบ' : undefined}
      height={300}
    >
      <Pie
        autoFit
        data={data}
        angleField="jobs"
        colorField="label"
        // A ring rather than a full pie: the hole is where the total goes, and
        // the reader wants "how many are open" before "how they split".
        innerRadius={0.58}
        radius={0.9}
        scale={pinned(labels, STATUS_COLOR)}
        label={{
          text: (d: StatusSlice) => (d.jobs / total > 0.06 ? `${d.jobs}` : ''),
          position: 'outside',
          style: { fontFamily: CHART_FONT, fontSize: 11, fill: BRAND.ink },
        }}
        legend={{ color: { position: 'right', rowPadding: 4, ...LEGEND_STYLE } }}
        interaction={{ tooltip: { css: TOOLTIP_STYLE } }}
        animate={{ enter: { duration: 300 } }}
        annotations={[
          {
            type: 'text',
            style: {
              text: `${total}`,
              x: '50%',
              y: '46%',
              textAlign: 'center',
              fontSize: 30,
              fontFamily: CHART_FONT,
              fill: BRAND.teal,
            },
          },
          {
            type: 'text',
            style: {
              text: 'งาน',
              x: '50%',
              y: '60%',
              textAlign: 'center',
              fontSize: 12,
              fontFamily: CHART_FONT,
              fill: BRAND.muted,
            },
          },
        ]}
      />
    </ChartFrame>
  );
}

const BOOKED = 'จองแล้ว';
const FREE = 'ที่ยังว่าง';
const LOAD_COLOR: Record<string, string> = { [BOOKED]: BRAND.blue, [FREE]: '#e6ecf3' };

export function UpcomingLoadChart({ data }: { data: LoadPoint[] }) {
  /*
   * Booked and free, stacked to the day's quota — not bars against a capacity
   * line on a second axis.
   *
   * The dual-axis version of this chart was wrong in a way that looked fine:
   * two axes scale independently, so the capacity line sat at whatever height
   * its own axis chose and crossing it meant nothing. The one question this
   * chart exists to answer — is next week already full? — was exactly the
   * question it could not answer. Stacked to a common total, a full bar IS a
   * full day, and there is only one scale to misread.
   */
  const stacked = data.flatMap((d) => {
    const rows = [{ day: d.day, dayFull: d.dayFull, kind: BOOKED, jobs: d.booked }];
    // A day with no quota configured contributes no free space — an empty
    // remainder would claim the day is fully booked when nobody set a limit.
    if (d.capacity !== null) {
      rows.push({
        day: d.day,
        dayFull: d.dayFull,
        kind: FREE,
        jobs: Math.max(0, d.capacity - d.booked),
      });
    }
    return rows;
  });

  return (
    <ChartFrame
      title="คิวงาน 14 วันข้างหน้า"
      hint="ส่วนสีน้ำเงินคือคิวที่จองแล้ว ส่วนสีจางคือที่ยังรับได้ — แท่งที่เป็นสีน้ำเงินเต็มคือวันที่เต็มแล้ว"
      empty={data.length === 0 ? 'ยังไม่ได้เปิดรับจองในช่วง 14 วันนี้' : undefined}
      height={300}
    >
      <Column
        autoFit
        data={stacked}
        xField="day"
        yField="jobs"
        colorField="kind"
        stack
        scale={pinned([BOOKED, FREE], LOAD_COLOR)}
        style={{ radiusTopLeft: 2, radiusTopRight: 2 }}
        axis={{
          x: { ...AXIS_STYLE, title: null },
          y: { ...AXIS_STYLE, title: null },
        }}
        legend={{
          color: { position: 'top', layout: { justifyContent: 'flex-end' }, ...LEGEND_STYLE },
        }}
        tooltip={{ title: (d: { dayFull: string }) => d.dayFull }}
        interaction={{ tooltip: { css: TOOLTIP_STYLE } }}
        animate={{ enter: { duration: 300 } }}
      />
    </ChartFrame>
  );
}
