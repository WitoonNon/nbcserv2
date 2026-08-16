import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * What search engines may look at.
 *
 * This application is not a marketing site — nbcgroup.co.th is. Almost
 * everything here sits behind a login and has no business in search results:
 * indexing it would put the company's own staff screens in Google, and would
 * put a second nbcgroup-branded domain in front of customers searching for the
 * first one. Two domains competing for the same brand is a loss, not a bonus.
 *
 * Exactly two pages are worth finding from outside:
 *
 * - `/booking`, which is a genuine destination — "จองคิวล้างแอร์ นนทบุรี"
 *   should be able to land a customer straight on it.
 * - `/track`, which people reach with a job number they already have.
 *
 * `/track` results carry a customer's job number and phone in the query
 * string, so those URLs are refused even though the bare page is allowed. The
 * page itself also sends `noindex` once a search has been run, because a
 * robots rule asks a crawler not to look while a meta tag tells it not to
 * keep — and a link shared into a public group needs the second one.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, '');

  // Preview builds are throwaway copies of the whole site. Indexed, they are
  // duplicates of production competing with it under a URL nobody should be
  // sent to.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/booking', '/track'],
        disallow: [
          // Staff application.
          '/dashboard',
          '/jobs',
          '/dispatch',
          '/schedule',
          '/customers',
          '/assets',
          '/reports',
          '/settings',
          '/work-orders',
          // Technician application.
          '/t',
          // Authentication and machinery.
          '/login',
          '/forbidden',
          '/change-password',
          '/api',
          // A tracking result identifies a customer and their job.
          '/track?',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
