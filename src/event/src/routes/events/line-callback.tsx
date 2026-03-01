import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CheckCircle2, XCircle, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { deliverViaLine, type LineDeliveryResult } from '../../lib/api';
import { th } from '../../lib/i18n';

type CallbackState = 'delivering' | 'success' | 'error' | 'not_friend';

export function LineCallbackPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>('delivering');
  const [result, setResult] = useState<LineDeliveryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lineUserId = searchParams.get('lineUserId');
  const searchId = searchParams.get('searchId');
  const status = searchParams.get('status');
  const deliveryCalled = useRef(false);

  useEffect(() => {
    if (deliveryCalled.current) return;
    deliveryCalled.current = true;
    if (status === 'not_friend') {
      setState('not_friend');
      return;
    }

    if (status === 'error') {
      setState('error');
      setErrorMessage(searchParams.get('message') || 'เกิดข้อผิดพลาด');
      return;
    }

    if (!eventId || !searchId || !lineUserId || status !== 'ok') {
      setState('error');
      setErrorMessage('ข้อมูลไม่ครบ');
      return;
    }

    // Deliver photos
    deliverViaLine(eventId, searchId, lineUserId)
      .then((deliveryResult) => {
        setResult(deliveryResult);
        setState('success');
      })
      .catch((err: Error) => {
        setState('error');
        setErrorMessage(err.message || 'ส่งรูปไม่สำเร็จ');
      });
  }, [eventId, searchId, lineUserId, status, searchParams]);

  const handleRetry = () => {
    if (!eventId || !searchId || !lineUserId) return;
    setState('delivering');
    deliverViaLine(eventId, searchId, lineUserId)
      .then((deliveryResult) => {
        setResult(deliveryResult);
        setState('success');
      })
      .catch((err: Error) => {
        setState('error');
        setErrorMessage(err.message || 'ส่งรูปไม่สำเร็จ');
      });
  };

  const handleBackToSearch = () => {
    if (eventId) {
      window.location.href = `/${eventId}/search`;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {state === 'delivering' && (
          <>
            <Loader2 className="mx-auto size-12 animate-spin text-primary" />
            <p className="text-lg font-medium">{th.lineCallback.delivering}</p>
          </>
        )}

        {state === 'success' && result && (
          <>
            <CheckCircle2 className="mx-auto size-12 text-green-500" />
            <div className="space-y-1">
              <p className="text-lg font-medium">
                {th.lineCallback.success(result.photoCount)}
              </p>
              <p className="text-sm text-muted-foreground">
                {th.lineCallback.successHint}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleBackToSearch}>
              {th.lineCallback.backToResults}
            </Button>
          </>
        )}

        {state === 'not_friend' && (
          <>
            <UserPlus className="mx-auto size-12 text-yellow-500" />
            <div className="space-y-1">
              <p className="text-lg font-medium">{th.lineCallback.notFriend}</p>
            </div>
            <Button size="sm" onClick={handleBackToSearch}>
              {th.lineCallback.backToResults}
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="mx-auto size-12 text-destructive" />
            <div className="space-y-1">
              <p className="text-lg font-medium">{th.lineCallback.error}</p>
              {errorMessage && (
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={handleBackToSearch}>
                {th.lineCallback.backToResults}
              </Button>
              {lineUserId && searchId && (
                <Button size="sm" onClick={handleRetry}>
                  {th.lineCallback.retry}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
