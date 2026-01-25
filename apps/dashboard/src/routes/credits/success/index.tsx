import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@sabaipics/uiv2/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sabaipics/uiv2/components/empty";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@sabaipics/uiv2/components/alert";
import { Spinner } from "@sabaipics/uiv2/components/spinner";
import { useApiClient } from "../../../lib/api";

interface PurchaseStatusResponse {
  fulfilled: boolean;
  credits: number | null;
  expiresAt?: string;
}

export function CreditSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { getToken } = useApiClient();

  // Use React Query for automatic polling
  const {
    data: purchaseStatus,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["credit-purchase", sessionId],
    queryFn: async (): Promise<PurchaseStatusResponse> => {
      if (!sessionId) {
        throw new Error("Missing session_id");
      }
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/purchase/${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return response.json() as Promise<PurchaseStatusResponse>;
    },
    // Poll every 2 seconds until fulfilled or timeout
    refetchInterval: (data: unknown) => {
      // Stop polling when purchase is fulfilled
      const status = data as PurchaseStatusResponse | undefined;
      if (status?.fulfilled) {
        return false;
      }
      return 2000;
    },
    gcTime: 30000, // Stop polling after 30 seconds
    staleTime: 0,
    retry: false, // Don't retry on error, just continue polling
  });

  // Invalid session state - no sessionId provided
  if (!sessionId) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b">
          <div className="container mx-auto flex h-16 items-center gap-4 px-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Purchase Status</h1>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlertCircle className="size-5 text-destructive" />
              </EmptyMedia>
              <EmptyTitle>Invalid session</EmptyTitle>
              <EmptyDescription>
                No checkout session found. If you completed a purchase, your
                credits will still be added to your account.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/dashboard">Return to Dashboard</Link>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  // Success state - webhook fulfilled
  if (purchaseStatus?.fulfilled && purchaseStatus.credits !== null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b">
          <div className="container mx-auto flex h-16 items-center gap-4 px-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">Payment confirmed</span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2 className="size-5 text-green-600" />
              </EmptyMedia>
              <EmptyTitle>Credits added!</EmptyTitle>
              <EmptyDescription>
                +{purchaseStatus.credits.toLocaleString()} credits have been
                added to your account.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" asChild>
                <Link to="/dashboard">
                  <LayoutDashboard className="mr-2 size-4" />
                  Dashboard
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  // Loading state - waiting for webhook
  if (isLoading || (!purchaseStatus?.fulfilled && sessionId)) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b">
          <div className="container mx-auto flex h-16 items-center gap-4 px-4">
            <div className="flex items-center gap-2">
              <Spinner className="size-5" />
              <span className="text-sm text-muted-foreground">
                Processing your purchase...
              </span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner className="size-16 text-primary" />
              </EmptyMedia>
              <EmptyTitle>Confirming payment...</EmptyTitle>
              <EmptyDescription>
                We're adding credits to your account. This usually takes a few
                seconds.
              </EmptyDescription>
            </EmptyHeader>
            {error && (
              <EmptyContent>
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Connection issue</AlertTitle>
                  <AlertDescription>
                    {(error as Error).message}
                  </AlertDescription>
                </Alert>
                <div className="text-xs text-muted-foreground mt-2">
                  Retrying...
                </div>
              </EmptyContent>
            )}
          </Empty>
        </div>
      </div>
    );
  }

  // Fallback / timeout state
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 className="size-16 text-green-600" />
            </EmptyMedia>
            <EmptyTitle>Purchase successful!</EmptyTitle>
            <EmptyDescription>
              Thank you for your purchase. Your credits will appear in your
              account shortly.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <LayoutDashboard className="size-4" />
                Dashboard
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
