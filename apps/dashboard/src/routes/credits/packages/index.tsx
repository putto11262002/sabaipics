import { AlertCircle, ArrowLeft, CreditCard, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { Button } from "@sabaipics/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sabaipics/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@sabaipics/ui/components/empty";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Spinner } from "@sabaipics/ui/components/spinner";
import { useCreditPackages } from "../../../hooks/credits/useCreditPackages";
import { usePurchaseCheckout } from "../../../hooks/credits/usePurchaseCheckout";
import { useState } from "react";

export function CreditPackagesPage() {
  const { data, isLoading, error, refetch, isRefetching } = useCreditPackages();
  const checkoutMutation = usePurchaseCheckout();
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);

  const handlePurchase = async (packageId: string) => {
    setPurchasingPackageId(packageId);
    try {
      const result = await checkoutMutation.mutateAsync({ packageId });
      // Redirect to Stripe checkout
      window.location.href = result.data.checkoutUrl;
    } catch (error) {
      // Error is handled by mutation state
      setPurchasingPackageId(null);
    }
  };

  const formatPrice = (priceInSatang: number) => {
    const priceInThb = priceInSatang / 100;
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(priceInThb);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Credit Packages</h1>
              <p className="text-sm text-muted-foreground">Choose a package to get started</p>
            </div>
          </div>
        </div>
      </header>
      <div className="container mx-auto flex flex-1 flex-col gap-4 p-4">
        {isLoading && (
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error loading packages</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                {isRefetching ? (
                  <Spinner className="mr-2 size-3" />
                ) : (
                  <RefreshCw className="mr-2 size-3" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {checkoutMutation.isError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Checkout failed</AlertTitle>
            <AlertDescription>
              {checkoutMutation.error?.message || "Failed to create checkout session. Please try again."}
            </AlertDescription>
          </Alert>
        )}

        {data && data.data.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard className="size-12 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No packages available</EmptyTitle>
              <EmptyDescription>
                Credit packages are not currently available. Please check back later.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {data && data.data.length > 0 && (
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            {data.data.map((pkg) => {
              const isPurchasing = purchasingPackageId === pkg.id;

              return (
                <Card key={pkg.id} className="@container/card">
                  <CardHeader>
                    <CardDescription>Credit Package</CardDescription>
                    <CardTitle className="text-2xl font-semibold">
                      {pkg.name}
                    </CardTitle>
                    <CardAction>
                      <Button
                        onClick={() => handlePurchase(pkg.id)}
                        disabled={isPurchasing || checkoutMutation.isPending}
                        size="sm"
                      >
                        {isPurchasing ? (
                          <>
                            <Spinner className="mr-2 size-3" />
                            Processing...
                          </>
                        ) : (
                          "Purchase"
                        )}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardFooter className="flex-col items-start gap-2 text-sm">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tabular-nums">
                        {pkg.credits.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">credits</span>
                    </div>
                    <div className="text-muted-foreground">
                      {formatPrice(pkg.priceThb)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Credits expire 6 months after purchase
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
