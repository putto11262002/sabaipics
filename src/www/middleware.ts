import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all routes except Next.js internals (_next/static, _next/image, favicon, etc.)
  // This handles both locale-prefixed (/(en|th)/*) and non-prefixed paths automatically
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
