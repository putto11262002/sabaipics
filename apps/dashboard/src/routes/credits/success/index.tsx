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
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../../lib/api";

interface DashboardData {
  data: {
    credits: {
      balance: number;
      nearestExpiry: string | null;
    };
  };
}

export function CreditSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();
  const navigate = useNavigate();

  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [creditsAdded, setCreditsAdded] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const redirectRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch dashboard data to check credit balance
  const fetchBalance = async (): Promise<number> => {
    const token = await getToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as DashboardData;
    return data.data.credits.balance;
  };

  // Poll for credit balance updates
  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;
    let pollCount = 0;
    const MAX_POLLS = 15; // Poll for up to 30 seconds (15 * 2s)

    const pollBalance = async () => {
      try {
        const balance = await fetchBalance();

        if (!isMounted) return;

        // Store initial balance on first fetch
        if (initialBalance === null) {
          setInitialBalance(balance);
          setCurrentBalance(balance);
        } else {
          setCurrentBalance(balance);
        }

        // Check if balance increased (webhook fulfilled)
        if (initialBalance !== null && balance > initialBalance) {
          setCreditsAdded(true);
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
      } catch (error) {
        console.error("Error polling balance:", error);
        // Continue polling on error
      }
    };

    // Initial fetch
    pollBalance();

    // Poll every 2 seconds
    pollingRef.current = setInterval(pollBalance, 2000);

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
  }, [sessionId, initialBalance, getToken, navigate]);

  // Also invalidate queries for other components
  useEffect(() => {
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [sessionId, queryClient]);

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

  if (loading && initialBalance !== null) {
    // Still waiting for webhook
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
            <EmptyContent>
              <div className="text-sm text-muted-foreground">
                Your balance: {initialBalance.toLocaleString()} credits
              </div>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  if (creditsAdded && currentBalance !== null) {
    // Credits successfully added
    const creditsGained = currentBalance - (initialBalance || 0);
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
                {creditsGained > 0
                  ? `+${creditsGained.toLocaleString()} credits have been added to your account.`
                  : "Your credits have been added to your account."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">New balance: </span>
                  <span className="font-semibold tabular-nums">
                    {currentBalance.toLocaleString()} credits
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Redirecting to dashboard...
                </div>
              </div>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  // Polling exhausted or initial load
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
              Thank you for your purchase. Your credits have been added to your
              account.
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
