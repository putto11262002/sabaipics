import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Input } from '@/shared/components/ui/input';
import { Gift, Loader2, AlertCircle, Plus, Check } from 'lucide-react';
import { useRedeemGiftCode } from '../../hooks/credits/useRedeemGiftCode';

interface GiftCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled code from URL ?code=XXX */
  initialCode?: string;
}

export function GiftCodeDialog({ open, onOpenChange, initialCode = '' }: GiftCodeDialogProps) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<{ creditsGranted: number; expiresAt: string } | null>(null);
  const redeemMutation = useRedeemGiftCode();

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Clean URL when closing
      window.history.replaceState({}, '', '/credits');
      // Reset state for next open
      setResult(null);
      redeemMutation.reset();
      if (!initialCode) setCode('');
    }
    onOpenChange(newOpen);
  };

  const handleRedeem = () => {
    if (!code.trim()) return;

    redeemMutation.mutate(
      { code: code.trim().toUpperCase() },
      {
        onSuccess: (data) => {
          setResult(data.data);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" />
            Gift Credits
          </DialogTitle>
          <DialogDescription>Enter a gift code to claim your free credits</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Success State */}
          {result && (
            <>
              <div className="relative overflow-hidden rounded-xl p-8 bg-success/10 border border-success/30">
                <div className="flex items-center justify-center gap-3">
                  <Plus className="size-10 text-success" strokeWidth={3} />
                  <div className="text-4xl font-bold text-success">
                    {result.creditsGranted.toLocaleString()} Credits
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Credits added:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {result.creditsGranted.toLocaleString()} image upload credits
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    Face recognition for all photos
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    Expires{' '}
                    {new Date(result.expiresAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </li>
                </ul>
              </div>

              <Button onClick={() => handleOpenChange(false)} className="w-full" size="lg">
                Done
              </Button>
            </>
          )}

          {/* Redeem Form */}
          {!result && (
            <>
              {/* Error State */}
              {redeemMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {redeemMutation.error?.message ?? 'Failed to redeem gift code'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Input
                  placeholder="Enter gift code (e.g. GIFT-ABC123)"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                  className="text-center font-mono text-lg tracking-wider"
                  autoFocus
                />
              </div>

              <Button
                onClick={handleRedeem}
                disabled={!code.trim() || redeemMutation.isPending}
                className="w-full"
                size="lg"
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  'Claim'
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                No payment required. Credits are added instantly.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
