'use client';

// Lazy-loaded wrapper for IosAppHorizontalScroll to allow ssr: false
import dynamic from 'next/dynamic';

export const IosAppHorizontalScroll = dynamic(
  () => import('./ios-app-horizontal-scroll').then((mod) => ({ default: mod.IosAppHorizontalScroll })),
  {
    ssr: false, // Client-only - relies on scroll events
  },
);
