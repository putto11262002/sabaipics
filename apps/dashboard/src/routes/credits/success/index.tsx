import { useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { CheckCircle2, CreditCard, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@sabaipics/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@sabaipics/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@sabaipics/ui/components/empty";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { useQueryClient } from "@tanstack/react-query";

export function CreditSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const queryClient = useQueryClient();

  // Invalidate dashboard query to refresh credit balance
  useEffect(() => {
    if (sessionId) {
      // Invalidate dashboard data to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [sessionId, queryClient]);

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
            <h1 className="text-xl font-semibold">Purchase Status</h1>
          </div>
        </header>
        <div className="container mx-auto flex flex-1 flex-col gap-4 p-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Invalid session</AlertTitle>
            <AlertDescription>
              No checkout session found. If you completed a purchase, your credits will still be added to your account.
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Purchase Successful</h1>
        </div>
      </header>
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 className="size-16 text-green-600" />
            </EmptyMedia>
            <EmptyTitle>Purchase successful!</EmptyTitle>
            <EmptyDescription>
              Thank you for your purchase. Your credits will appear in your account shortly.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              Payment Confirmed
            </CardTitle>
            <CardDescription>
              Session ID: {sessionId}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-2">
              Your payment has been processed successfully. Credits are being added to your account.
            </p>
            <p>
              This may take a few seconds. Your credit balance will update automatically when you return to the dashboard.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild size="lg">
              <Link to="/dashboard">Return to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
