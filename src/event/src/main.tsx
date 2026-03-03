import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/shared/components/ui/sonner';
import './event.css';
import 'react-photo-album/rows.css';
import { shouldRetry } from '@/shared/lib/api-error';
import { getPostHogApiKey, POSTHOG_CONFIG } from '@/shared/lib/posthog';
import { router } from './router';
import { EventThemeProvider } from './components/EventThemeProvider';
import { installGlobalErrorHandlers } from './lib/client-error-reporter';
import { AppErrorBoundary } from './components/errors/AppErrorBoundary';

const phKey = getPostHogApiKey();
if (phKey) {
  posthog.init(phKey, {
    ...POSTHOG_CONFIG,
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});

installGlobalErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
      <EventThemeProvider>
        <RouterProvider router={router} />
      </EventThemeProvider>
      </AppErrorBoundary>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  </StrictMode>,
);
