export const POSTHOG_CONFIG = {
  api_host: 'https://us.i.posthog.com',
  capture_pageview: true,
  capture_pageleave: true,
  autocapture: false,
  persistence: 'localStorage+cookie' as const,
} as const;

export function getPostHogApiKey(): string | null {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  return typeof key === 'string' && key.length > 0 ? key : null;
}
