import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/shared/components/ui/sonner';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import '@/shared/styles/globals.css';
import './admin.css';
import 'sonner/dist/styles.css';
import { shouldRetry } from '@/shared/lib/api-error';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
