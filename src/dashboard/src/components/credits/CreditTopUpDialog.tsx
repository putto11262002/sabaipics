import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/shared/components/ui/table';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/spinner';
import { calculateTieredDiscount } from '../../lib/credits/discount';
import { useTopUpCheckout } from '../../hooks/credits/useTopUpCheckout';
import { useValidatePromoCode } from '../../hooks/credits/useValidatePromoCode';
import { useDebounce } from '../../hooks/useDebounce';

interface CreditTopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: number | null;
  initialPromoCode?: string | null;
}

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 10000;
const QUICK_AMOUNTS = [100, 500, 1000];

export function CreditTopUpDialog({
  open,
  onOpenChange,
  initialAmount,
  initialPromoCode,
}: CreditTopUpDialogProps) {
  const [amount, setAmount] = useState(initialAmount || 50);
  const [promoCode, setPromoCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const checkoutMutation = useTopUpCheckout();

  // Debounce promo code input for validation
  const debouncedPromoCode = useDebounce(promoCode, 500);
  const validateQuery = useValidatePromoCode(
    debouncedPromoCode,
    open && debouncedPromoCode.length > 0
  );

  const promoData = validateQuery.data?.data;
  const isDiscountCode = promoData?.type === 'discount';
  const isValidPromo = validateQuery.isSuccess && isDiscountCode;

  // Check if amount meets minimum requirement
  const minAmountRequired = isValidPromo && promoData ? promoData.minAmountThb || MIN_AMOUNT : MIN_AMOUNT;
  const meetsMinimum = amount >= minAmountRequired;
  const canApplyDiscount = isValidPromo && meetsMinimum;

  // Calculate preview with promo code discount
  const preview = useMemo(() => {
    // Base calculation
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT || amount === 0) {
      return {
        originalAmount: amount,
        finalAmount: amount,
        discountPercent: 0,
        bonusCredits: 0,
        creditAmount: 0,
        effectiveRate: 0,
        promoDiscount: 0,
      };
    }

    const base = calculateTieredDiscount(amount);

    // Apply promo code discount only if valid AND meets minimum
    if (canApplyDiscount && promoData) {
      let promoDiscount = 0;

      if (promoData.discountType === 'percent') {
        promoDiscount = Math.round(amount * (promoData.discountPercent / 100));
      } else {
        promoDiscount = Math.min(promoData.discountAmount / 100, amount); // Convert satang to THB
      }

      return {
        ...base,
        promoDiscount,
        finalAmount: base.finalAmount - promoDiscount,
      };
    }

    return { ...base, promoDiscount: 0 };
  }, [amount, canApplyDiscount, promoData]);

  // Reset amount when dialog opens
  useEffect(() => {
    if (open && initialAmount) {
      setAmount(initialAmount);
    }
  }, [open, initialAmount]);

  // Set promo code when dialog opens
  useEffect(() => {
    if (open && initialPromoCode) {
      setPromoCode(initialPromoCode);
    }
  }, [open, initialPromoCode]);

  const handleCheckout = () => {
    setErrorMessage('');
    checkoutMutation.mutate(
      { amount, promoCode: promoCode || undefined },
      {
        onSuccess: (result) => {
          window.location.href = result.data.checkoutUrl;
        },
        onError: (error) => {
          setErrorMessage(error.message);
        },
      },
    );
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value === '') {
      setAmount(0);
      return;
    }
    const numValue = parseInt(value, 10);
    setAmount(numValue);
  };

  const isValidAmount = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
  const canCheckout = isValidAmount && !errorMessage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Top Up Credits</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              Amount (THB)
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-muted-foreground">
                ฿
              </span>
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                value={amount === 0 ? '' : amount}
                onChange={handleAmountChange}
                className="h-16 pl-12 pr-4 !text-3xl font-bold bg-muted border-0 focus-visible:ring-1"
                style={{ fontSize: '1.875rem' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter amount between {MIN_AMOUNT}-{MAX_AMOUNT.toLocaleString()} THB
            </p>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex justify-center gap-3">
            {QUICK_AMOUNTS.map((quickAmount) => {
              const { discountPercent } = calculateTieredDiscount(quickAmount);
              return (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-center transition-colors ${
                    amount === quickAmount
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-semibold">{quickAmount.toLocaleString()} ฿</span>
                  {discountPercent > 0 && (
                    <span className="block text-xs text-success">+{discountPercent}% bonus</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Promo Code Input */}
          <div className="space-y-2">
            <Label htmlFor="promoCode" className="text-sm font-medium">
              Discount Code (Optional)
            </Label>
            <div className="relative">
              <Input
                id="promoCode"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Enter discount code"
                disabled={!!initialPromoCode}
                className={initialPromoCode ? 'bg-muted pr-10' : 'pr-10'}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {promoCode && !initialPromoCode && (
                  <>
                    {/* Clear button */}
                    <button
                      type="button"
                      onClick={() => setPromoCode('')}
                      className="hover:bg-muted rounded-sm p-0.5 transition-colors"
                      aria-label="Clear code"
                    >
                      <X className="size-4 text-muted-foreground hover:text-foreground" />
                    </button>

                    {/* Status icon */}
                    {validateQuery.isLoading && (
                      <Spinner className="size-4 text-muted-foreground" />
                    )}
                    {validateQuery.isSuccess && isValidPromo && meetsMinimum && (
                      <CheckCircle2 className="size-4 text-success" />
                    )}
                    {validateQuery.isError && (
                      <XCircle className="size-4 text-destructive" />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Promo Code Status Messages */}
            {promoCode && !initialPromoCode && (
              <>
                {/* Valid and applied */}
                {validateQuery.isSuccess && isValidPromo && meetsMinimum && promoData && (
                  <p className="text-xs text-success font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    {promoData.discountType === 'percent'
                      ? `${promoData.discountPercent}% off applied!`
                      : `${promoData.discountAmount / 100} THB off applied!`}
                  </p>
                )}

                {/* Invalid code */}
                {validateQuery.isError && (
                  <p className="text-xs text-destructive font-medium flex items-center gap-1">
                    <XCircle className="size-3" />
                    Invalid or expired discount code
                  </p>
                )}

                {/* Wrong type (gift code) */}
                {validateQuery.isSuccess && !isDiscountCode && (
                  <p className="text-xs text-warning font-medium flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    This is a gift code, not a discount code
                  </p>
                )}
              </>
            )}

            {initialPromoCode && (
              <p className="text-xs text-success font-medium">
                Discount code applied!
              </p>
            )}
          </div>

          {/* Base Minimum Alert (50 THB) */}
          {!isValidAmount && amount > 0 && (
            <Alert variant="warning">
              <AlertCircle className="size-4" />
              <AlertDescription>
                Minimum purchase is {MIN_AMOUNT} THB
              </AlertDescription>
            </Alert>
          )}

          {/* Promo Code Minimum Warning */}
          {isValidPromo && !meetsMinimum && isValidAmount && promoData && (
            <Alert variant="warning">
              <AlertCircle className="size-4" />
              <AlertDescription>
                Enter at least {minAmountRequired} THB to use this discount code
              </AlertDescription>
            </Alert>
          )}

          {/* Checkout Error Alert */}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Preview Table */}
          <div className="rounded-lg overflow-hidden">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">Image Upload Credits:</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {preview.creditAmount.toLocaleString()} credits
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Bonus credits:</TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      preview.bonusCredits > 0 ? 'text-success/80' : 'text-muted-foreground'
                    }`}
                  >
                    {preview.bonusCredits > 0 ? `+${preview.bonusCredits}` : '0'} ({preview.discountPercent}%)
                  </TableCell>
                </TableRow>
                {preview.promoDiscount > 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground">Promo discount:</TableCell>
                    <TableCell className="text-right font-medium text-success">
                      -{preview.promoDiscount.toLocaleString()} ฿
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-medium">You pay:</TableCell>
                  <TableCell className="text-right font-bold">
                    {preview.finalAmount.toLocaleString()} ฿
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

        </div>

        <DialogFooter>
          <Button
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending || !canCheckout}
            className="w-full"
            size="lg"
          >
            {checkoutMutation.isPending ? (
              <>
                <Spinner className="mr-1 size-4" />
                Redirecting to Payment...
              </>
            ) : (
              <>Proceed to Payment →</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
