import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Field photos are served from object storage; the host is env-driven so the
  // storage decision (R2 vs S3 vs local MinIO) never requires a code change.
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_MEDIA_HOST
      ? [{ protocol: 'https', hostname: process.env.NEXT_PUBLIC_MEDIA_HOST }]
      : [],
  },
  experimental: {
    // Technician PWA uploads whole work orders (photos + signatures) in one call.
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default withNextIntl(nextConfig);
