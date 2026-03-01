'use client';

// Lazy-loaded wrapper for SiteNav to reduce initial bundle size
import dynamic from 'next/dynamic';

export const SiteNav = dynamic(() => import('./site-nav-client').then((mod) => ({ default: mod.SiteNav })), {
  ssr: false, // Don't render on server - load after hydration
});
