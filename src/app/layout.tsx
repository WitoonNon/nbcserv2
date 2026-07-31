import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { mitr, sarabun } from '@/lib/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NBC Service — ระบบบริหารงานซ่อมและบริการ',
    template: '%s · NBC Service',
  },
  description:
    'ระบบบริหารงานซ่อม บำรุงรักษา และจัดคิวช่าง สำหรับ บริษัท เอ็นบีซี กรุ๊ป จำกัด',
  icons: { icon: '/brand/nbc-logo.png' },
};

export const viewport: Viewport = {
  themeColor: '#132945',
  width: 'device-width',
  initialScale: 1,
  // Technicians wear gloves and work in bright sun — allow zoom.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="th" className={`${mitr.variable} ${sarabun.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
