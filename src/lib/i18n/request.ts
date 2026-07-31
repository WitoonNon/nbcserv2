import { getRequestConfig } from 'next-intl/server';
import th from './messages/th.json';
import en from './messages/en.json';

/**
 * Thai is the default and the language the system is designed in. English is a
 * first-class second locale from day one because factory and hotel clients
 * often need English documents (@client-confirm G9) — retrofitting i18n later
 * is far more expensive than carrying it from the start.
 */
export const locales = ['th', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'th';

const catalogues: Record<Locale, unknown> = { th, en };

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: catalogues[locale] as Record<string, string>,
    timeZone: 'Asia/Bangkok',
  };
});
