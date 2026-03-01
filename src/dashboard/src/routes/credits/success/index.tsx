import { useSearchParams, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/spinner';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { api } from '../../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getPurchaseStatus = api['credit-packages'].purchase[':sessionId'].$get;
type PurchaseApiResponse = InferResponseType<typeof getPurchaseStatus, SuccessStatusCode>;

export function CreditSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const navigate = useNavigate();

  // Use React Query for automatic polling
  const {
    data: purchaseStatus,
    isLoading,
    error,
  } = useApiQuery<PurchaseApiResponse>({
    queryKey: ['credit-purchase', sessionId],
    apiFn: (opts) => getPurchaseStatus({ param: { sessionId: sessionId! } }, opts),
    enabled: !!sessionId,
    // Poll every 2 seconds until fulfilled
    refetchInterval: (query) => {
      // Stop polling when purchase is fulfilled
      if (query.state.data?.fulfilled) {
        return false;
      }
      return 2000;
    },
    gcTime: 30000, // Stop polling after 30 seconds
    staleTime: 0,
    retry: false, // Don't retry on error, just continue polling
  });

  // Auto-redirect to dashboard after success
  useEffect(() => {
    if (purchaseStatus?.fulfilled && purchaseStatus.credits !== null) {
      const timer = setTimeout(() => {
        navigate('/dashboard');
      }, 3000); // Redirect after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [purchaseStatus?.fulfilled, purchaseStatus?.credits, navigate]);

  // Invalid session state - no sessionId provided
  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <AlertCircle className="size-16 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Invalid session</h1>
            <p className="text-muted-foreground">
              No checkout session found. If you completed a purchase, your credits will still be
              added to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success state - webhook fulfilled
  if (purchaseStatus?.fulfilled && purchaseStatus.credits !== null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-8 max-w-md">
          <div className="flex justify-center">
            <CheckCircle2 className="size-24 text-success" strokeWidth={1.5} />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold">Success!</h1>
            <p className="text-lg text-muted-foreground">
              +{purchaseStatus.credits.toLocaleString()} credits added to your account
            </p>
            <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state - waiting for webhook
  if (isLoading || (!purchaseStatus?.fulfilled && sessionId)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <Spinner className="size-16 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Confirming payment...</h1>
            <p className="text-muted-foreground">
              We're adding credits to your account. This usually takes a few seconds.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // Fallback / timeout state
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <CheckCircle2 className="size-16 text-success" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Purchase successful!</h1>
          <p className="text-muted-foreground">
            Thank you for your purchase. Your credits will appear in your account shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
