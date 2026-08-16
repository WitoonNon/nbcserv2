import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * The two pages a stranger should be able to find.
 *
 * Deliberately tiny. A sitemap is a statement of what is worth indexing, not
 * an inventory of what exists — listing the staff application here would
 * contradict robots.ts and invite exactly the indexing it refuses.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().APP_URL.replace(/\/$/, '');

  return [
    {
      url: `${base}/booking`,
      changeFrequency: 'daily',
      // The calendar changes every day and is the page worth ranking.
      priority: 1,
    },
    {
      url: `${base}/track`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
