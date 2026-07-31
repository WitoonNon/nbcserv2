import localFont from 'next/font/local';

/**
 * Self-hosted brand fonts.
 *
 * Deliberately NOT loaded from the Google Fonts CDN: the technician PWA has to
 * work offline in plant rooms and basements, and a blocked CDN must never
 * degrade a printed work order.
 */

export const mitr = localFont({
  src: [{ path: '../assets/fonts/Mitr-SemiBold.ttf', weight: '600', style: 'normal' }],
  variable: '--font-mitr',
  display: 'swap',
  fallback: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
});

export const sarabun = localFont({
  src: [
    { path: '../assets/fonts/Sarabun-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../assets/fonts/Sarabun-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../assets/fonts/Sarabun-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-sarabun',
  display: 'swap',
  fallback: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
});
