import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/shared/components/ui/sonner';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import './dashboard.css';
import 'sonner/dist/styles.css';
import { shouldRetry } from '@/shared/lib/api-error';
import { router } from './router.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider publishableKey={clerkPubKey}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
