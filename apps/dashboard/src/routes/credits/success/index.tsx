import { useEffect, useState, useRef } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@sabaipics/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sabaipics/ui/components/empty";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@sabaipics/ui/components/alert";
import { Spinner } from "@sabaipics/ui/components/spinner";
import { PageHeader } from "../../../components/shell/page-header";
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
  const navigate = useNavigate();

  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const redirectRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch purchase status from dedicated endpoint
  const fetchPurchaseStatus = async (): Promise<PurchaseStatusResponse> => {
    const token = await getToken();
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/credit-packages/purchase/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json() as Promise<PurchaseStatusResponse>;
  };

  // Poll for purchase fulfillment
  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;
    let pollCount = 0;
    const MAX_POLLS = 15; // Poll for up to 30 seconds (15 * 2s)

    const pollStatus = async () => {
      try {
        const status = await fetchPurchaseStatus();

        if (!isMounted) return;

        setPurchaseStatus(status);
        setError(null);

        // Check if purchase is fulfilled
        if (status.fulfilled) {
          setLoading(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          // Auto-redirect to dashboard after 2 seconds
          redirectRef.current = setTimeout(() => {
            navigate("/dashboard");
          }, 2000);

          return;
        }

        // Stop polling after max attempts
        pollCount++;
        if (pollCount >= MAX_POLLS) {
          setLoading(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        const errorMessage = err instanceof Error ? err.message : "Failed to check purchase status";
        setError(errorMessage);
        // Continue polling on error (might be temporary network issue)
      }
    };

    // Initial fetch
    pollStatus();

    // Poll every 2 seconds
    pollingRef.current = setInterval(pollStatus, 2000);

    // Cleanup
    return () => {
      isMounted = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (redirectRef.current) {
        clearTimeout(redirectRef.current);
      }
    };
  }, [sessionId, getToken, navigate]);

  if (!sessionId) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Purchase Status" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Invalid session</AlertTitle>
            <AlertDescription>
              No checkout session found. If you completed a purchase, your
              credits will still be added to your account.
            </AlertDescription>
          </Alert>
          <div className="flex justify-center">
            <Button asChild>
              <Link to="/dashboard">Return to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state - waiting for webhook
  if (loading) {
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
                  <AlertDescription>{error}</AlertDescription>
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
                <CheckCircle2 className="size-16 text-green-600" />
              </EmptyMedia>
              <EmptyTitle>Credits added!</EmptyTitle>
              <EmptyDescription>
                +{purchaseStatus.credits.toLocaleString()} credits have been
                added to your account.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="text-sm">
                <span className="text-muted-foreground">Valid until: </span>
                <span className="font-semibold">
                  {purchaseStatus.expiresAt
                    ? new Date(purchaseStatus.expiresAt).toLocaleDateString(
                        "th-TH",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )
                    : "6 months from now"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Redirecting to dashboard...
              </div>
            </EmptyContent>
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
