import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Include non-locale paths we want to redirect into the locale-prefixed routes.
  // This is important for external reviewers (e.g., Apple) who may open /privacy or /terms directly.
  matcher: ['/', '/(en|th)/:path*', '/privacy', '/terms'],
};
