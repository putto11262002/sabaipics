import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sabaipics/uiv3/components/dialog';
import { Button } from '@sabaipics/uiv3/components/button';
import { Input } from '@sabaipics/uiv3/components/input';
import { Label } from '@sabaipics/uiv3/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@sabaipics/uiv3/components/table';
import { Loader2 } from 'lucide-react';
import { calculateTieredDiscount } from '../../lib/credits/discount';
import { useTopUpCheckout } from '../../hooks/credits/useTopUpCheckout';

interface CreditTopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: number | null;
}

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 10000;
const QUICK_AMOUNTS = [100, 500, 1000];

export function CreditTopUpDialog({
  open,
  onOpenChange,
  initialAmount,
}: CreditTopUpDialogProps) {
  const [amount, setAmount] = useState(initialAmount || 50);
  const checkoutMutation = useTopUpCheckout();

  // Calculate discount instantly (no API call needed!)
  const preview = useMemo(() => {
    // Always show preview, even if amount is invalid (will show zeros)
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT || amount === 0) {
      return {
        originalAmount: amount,
        finalAmount: amount,
        discountPercent: 0,
        bonusCredits: 0,
        creditAmount: 0,
        effectiveRate: 0,
      };
    }
    return calculateTieredDiscount(amount);
  }, [amount]);

  // Reset amount when dialog opens with initialAmount
  useEffect(() => {
    if (open && initialAmount) {
      setAmount(initialAmount);
    }
  }, [open, initialAmount]);

  const handleCheckout = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({ amount });
      window.location.href = result.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create checkout';
      alert(message);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    // Allow empty input (user is typing)
    if (value === '') {
      setAmount(0);
      return;
    }
    const numValue = parseInt(value, 10);
    setAmount(numValue);
  };

  const isValidAmount = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;

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
                className="h-16 pl-12 pr-4 !text-3xl font-bold bg-muted border-0"
                style={{ fontSize: '1.875rem' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter amount between {MIN_AMOUNT}-{MAX_AMOUNT.toLocaleString()} THB
            </p>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex justify-center gap-3">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <Button
                key={quickAmount}
                variant={amount === quickAmount ? 'secondary' : 'outline'}
                size="lg"
                onClick={() => setAmount(quickAmount)}
                className="flex-1"
              >
                {quickAmount.toLocaleString()} ฿
              </Button>
            ))}
          </div>

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
                      preview.bonusCredits > 0 ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    {preview.bonusCredits > 0 ? `+${preview.bonusCredits}` : '0'} ({preview.discountPercent}%)
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">You pay:</TableCell>
                  <TableCell className="text-right font-bold">
                    {preview.finalAmount.toLocaleString()} ฿
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Checkout Button */}
          <Button
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending || !isValidAmount}
            className="w-full"
            size="lg"
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Redirecting to Payment...
              </>
            ) : (
              <>Proceed to Payment →</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
