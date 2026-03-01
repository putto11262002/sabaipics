import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CheckCircle2, XCircle, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { type LineDeliveryResult, checkFriendshipStatus } from '../../lib/api';
import { th } from '../../lib/i18n';
import { useDeliverViaLine } from '@/shared/hooks/rq/line/use-deliver-via-line';

type CallbackState = 'delivering' | 'success' | 'error' | 'not_friend' | 'checking_friend';

const POLL_INTERVAL_MS = 3000; // 3 seconds
const POLL_MAX_ATTEMPTS = 60; // 3 minutes max

export function LineCallbackPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>('delivering');
  const [result, setResult] = useState<LineDeliveryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  const lineUserId = searchParams.get('lineUserId');
  const searchId = searchParams.get('searchId');
  const status = searchParams.get('status');
  const deliveryCalled = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const { mutateAsync: deliverPhotos } = useDeliverViaLine();

  // Safe state updates that check if component is still mounted
  const safeSetState = useCallback(<T,>(updater: (prev: T) => T, setter: (value: T) => void) => {
    if (mountedRef.current) {
      setter(updater as unknown as T);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Friendship polling effect
  useEffect(() => {
    if (state !== 'not_friend' || !lineUserId) return;
    if (pollAttempts >= POLL_MAX_ATTEMPTS) {
      setState('error');
      setErrorMessage(th.lineCallback.sessionExpired);
      return;
    }

    // Create new AbortController for this polling cycle
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    pollingRef.current = setTimeout(async () => {
      if (signal.aborted || !mountedRef.current) return;

      setState('checking_friend');
      try {
        const friendshipStatus = await checkFriendshipStatus(lineUserId);

        // Check if still mounted and not aborted
        if (signal.aborted || !mountedRef.current) return;

        if (friendshipStatus.isFriend) {
          // Friend detected - proceed to delivery
          if (eventId && searchId && lineUserId) {
            setState('delivering');
            deliverPhotos({ eventId, searchId, lineUserId })
              .then((deliveryResult) => {
                if (mountedRef.current) {
                  setResult(deliveryResult);
                  setState('success');
                }
              })
              .catch((err: Error) => {
                if (mountedRef.current) {
                  setState('error');
                  setErrorMessage(err.message || 'ส่งรูปไม่สำเร็จ');
                }
              });
          }
        } else {
          // Still not a friend - continue polling
          setPollAttempts((prev) => prev + 1);
          setState('not_friend');
        }
      } catch {
        // Check if still mounted before updating state
        if (signal.aborted || !mountedRef.current) return;

        // On error, continue polling
        setPollAttempts((prev) => prev + 1);
        setState('not_friend');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [state, lineUserId, eventId, searchId, pollAttempts, deliverPhotos]);

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

    // Deliver photos - photoIds are looked up from the pending delivery record on the server
    deliverPhotos({ eventId, searchId, lineUserId })
      .then((deliveryResult) => {
        setResult(deliveryResult);
        setState('success');
      })
      .catch((err: Error) => {
        setState('error');
        setErrorMessage(err.message || 'ส่งรูปไม่สำเร็จ');
      });
  }, [eventId, searchId, lineUserId, status, searchParams, deliverPhotos]);

  const handleRetry = () => {
    if (!eventId || !searchId || !lineUserId) return;
    setState('delivering');
    deliverPhotos({ eventId, searchId, lineUserId })
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

        {(state === 'not_friend' || state === 'checking_friend') && (
          <>
            <UserPlus className="mx-auto size-12 text-yellow-500" />
            <div className="space-y-1">
              <p className="text-lg font-medium">{th.lineCallback.notFriend}</p>
              {state === 'checking_friend' ? (
                <p className="text-sm text-muted-foreground">{th.lineCallback.checkingFriend}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{th.lineCallback.notFriendHint}</p>
              )}
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
