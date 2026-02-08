import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sabaipics/uiv3/components/dialog';
import { Button } from '@sabaipics/uiv3/components/button';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import { Gift, Loader2, AlertCircle, Plus, Check } from 'lucide-react';
import { useTopUpCheckout } from '../../hooks/credits/useTopUpCheckout';
import { useValidatePromoCode } from '../../hooks/credits/useValidatePromoCode';

interface GiftCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  giftCode: string;
}

export function GiftCodeDialog({
  open,
  onOpenChange,
  giftCode,
}: GiftCodeDialogProps) {
  const [claiming, setClaiming] = useState(false);
  const validateQuery = useValidatePromoCode(giftCode, open);
  const checkoutMutation = useTopUpCheckout();

  const promoData = validateQuery.data?.data;
  const isGiftCode = promoData?.type === 'gift';
  const giftData = isGiftCode ? promoData : null;
  const isValid = validateQuery.isSuccess && isGiftCode;

  // Clean URL when dialog closes (without claiming)
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !claiming) {
      // User closed dialog without claiming - clean URL
      window.history.replaceState({}, '', '/dashboard');
    }
    onOpenChange(newOpen);
  };

  const handleClaimGift = async () => {
    if (!giftData) return;

    setClaiming(true);
    try {
      const result = await checkoutMutation.mutateAsync({
        amount: giftData.maxAmountThb,
        promoCode: giftCode,
      });
      // Don't clean URL - Stripe will redirect back to /dashboard?code=XXX on cancel
      window.location.href = result.checkoutUrl;
    } catch (error) {
      setClaiming(false);
      const message = error instanceof Error ? error.message : 'Failed to claim gift';
      alert(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" />
            Gift Credits
          </DialogTitle>
          <DialogDescription>
            Claim your free credits
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Loading State */}
          {validateQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Validating gift code...</p>
            </div>
          )}

          {/* Error State */}
          {validateQuery.isError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                {validateQuery.error instanceof Error
                  ? validateQuery.error.message
                  : 'Invalid or expired gift code'}
              </AlertDescription>
            </Alert>
          )}

          {/* Invalid Type (not a gift code) */}
          {validateQuery.isSuccess && !isGiftCode && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                This code is not a gift code. Please use it in the credit top-up dialog instead.
              </AlertDescription>
            </Alert>
          )}

          {/* Success - Show Gift Details */}
          {isValid && giftData && (
            <>
              <div className="relative overflow-hidden rounded-xl p-8 bg-success/10 border border-success/30">
                <div className="flex items-center justify-center gap-3">
                  <Plus className="size-10 text-success" strokeWidth={3} />
                  <div className="text-4xl font-bold text-success">
                    {giftData.credits.toLocaleString()} Credits
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">What you'll get:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {giftData.credits.toLocaleString()} image upload credits
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    Face recognition for all photos
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    Credits expire in 365 days
                  </li>
                  {giftData.expiresAt && (
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-success" />
                      Offer expires {new Date(giftData.expiresAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </li>
                  )}
                </ul>
              </div>

              <Button
                onClick={handleClaimGift}
                disabled={claiming}
                className="w-full"
                size="lg"
              >
                {claiming ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>Claim</>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                No payment required. You'll be redirected to confirm.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
