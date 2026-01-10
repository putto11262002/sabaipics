import { AlertCircle, ArrowLeft, Check, CreditCard, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { Button } from "@sabaipics/ui/components/button";
import {
  Card,
  CardContent,
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
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(priceInThb);
  };

  // Only show first 3 packages
  const displayPackages = data?.data.slice(0, 3) || [];

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
            <h1 className="text-lg font-semibold">Buy Credits</h1>
          </div>
        </div>
      </header>
      <div className="container mx-auto flex flex-1 flex-col gap-6 p-4 md:p-6">
        {/* Header Section */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Choose Your Credit Package</h1>
          <p className="mt-2 text-muted-foreground">
            Select a package that fits your needs. Credits expire 6 months after purchase.
          </p>
        </div>

        {isLoading && (
          <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-3">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mx-auto max-w-2xl">
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
          <Alert variant="destructive" className="mx-auto max-w-2xl">
            <AlertCircle className="size-4" />
            <AlertTitle>Checkout failed</AlertTitle>
            <AlertDescription>
              {checkoutMutation.error?.message || "Failed to create checkout session. Please try again."}
            </AlertDescription>
          </Alert>
        )}

        {data && displayPackages.length === 0 && (
          <Empty className="mx-auto max-w-md">
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

        {data && displayPackages.length > 0 && (
          <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-3">
            {displayPackages.map((pkg, index) => {
              const isPurchasing = purchasingPackageId === pkg.id;
              const isPopular = index === 1; // Middle package is "popular"

              return (
                <Card
                  key={pkg.id}
                  className={isPopular ? "relative border-primary shadow-lg" : ""}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        Popular
                      </span>
                    </div>
                  )}
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{pkg.name}</CardTitle>
                    <CardDescription>Perfect for getting started</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Price */}
                    <div className="text-center">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-bold tabular-nums">
                          ฿{formatPrice(pkg.priceThb)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">One-time payment</p>
                    </div>

                    {/* Credits */}
                    <div className="rounded-lg bg-muted p-4 text-center">
                      <div className="text-3xl font-bold tabular-nums">{pkg.credits.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">Credits</div>
                    </div>

                    {/* Features */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-primary" />
                        <span>Upload {pkg.credits.toLocaleString()} photos</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-primary" />
                        <span>Face recognition included</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-primary" />
                        <span>6 months validity</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-primary" />
                        <span>QR code sharing</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={() => handlePurchase(pkg.id)}
                      disabled={isPurchasing || checkoutMutation.isPending}
                      className="w-full"
                      size="lg"
                      variant={isPopular ? "default" : "outline"}
                    >
                      {isPurchasing ? (
                        <>
                          <Spinner className="mr-2 size-4" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 size-4" />
                          Buy Now
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Info Section */}
        {data && displayPackages.length > 0 && (
          <div className="mx-auto max-w-2xl text-center text-sm text-muted-foreground">
            <p>
              Secure payment powered by Stripe. Credits expire 6 months after purchase.
              Need more credits? Contact us for enterprise plans.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
