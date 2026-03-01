import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CheckCircle2, XCircle, Loader2, UserPlus, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { type LineDeliveryResult, checkFriendshipStatus } from '../../lib/api';
import { th } from '../../lib/i18n';
import { useDeliverViaLine } from '@/shared/hooks/rq/line/use-deliver-via-line';

type CallbackState = 'delivering' | 'success' | 'error' | 'waiting_for_friend' | 'checking_friend';

const POLL_INTERVAL_MS = 3000; // 3 seconds
const POLL_MAX_ATTEMPTS = 60; // 3 minutes max

const LINE_OA_URL = 'https://line.me/R/ti/p/@your-oa-id'; // TODO: Replace with actual OA URL

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
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { mutateAsync: deliverPhotos } = useDeliverViaLine();

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Attempt delivery
  const attemptDelivery = useCallback(async () => {
    if (!eventId || !searchId || !lineUserId) {
      setState('error');
      setErrorMessage('ข้อมูลไม่ครบ');
      return;
    }

    setState('delivering');
    try {
      const deliveryResult = await deliverPhotos({ eventId, searchId, lineUserId });
      setResult(deliveryResult);
      setState('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ส่งรูปไม่สำเร็จ';
      if (message.includes('NOT_FOUND') || message.includes('expired')) {
        setState('error');
        setErrorMessage(th.lineCallback.sessionExpired);
      } else if (message.includes('not friend') || message.includes('FRIEND')) {
        // Still not friend, go back to waiting
        setState('waiting_for_friend');
      } else {
        setState('error');
        setErrorMessage(message);
      }
    }
  }, [eventId, searchId, lineUserId, deliverPhotos]);

  // Poll for friendship status
  const pollFriendship = useCallback(async () => {
    if (!lineUserId) return;

    try {
      const friendship = await checkFriendshipStatus(lineUserId);
      if (friendship.isFriend) {
        stopPolling();
        setState('checking_friend');
        // Small delay before attempting delivery
        setTimeout(() => attemptDelivery(), 500);
      }
    } catch {
      // On error, continue polling
    }
  }, [lineUserId, stopPolling, attemptDelivery]);

  // Handle initial state
  useEffect(() => {
    if (deliveryCalled.current) return;
    deliveryCalled.current = true;

    if (status === 'not_friend') {
      setState('waiting_for_friend');
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

    // Status is 'ok' - proceed with delivery
    attemptDelivery();
  }, [eventId, searchId, lineUserId, status, searchParams, attemptDelivery]);

  // Polling effect for 'waiting_for_friend' state
  useEffect(() => {
    if (state !== 'waiting_for_friend') {
      stopPolling();
      return;
    }

    // Start polling
    pollIntervalRef.current = setInterval(() => {
      setPollAttempts((prev) => {
        const next = prev + 1;
        if (next >= POLL_MAX_ATTEMPTS) {
          stopPolling();
          setState('error');
          setErrorMessage(th.lineCallback.sessionExpired);
        }
        return next;
      });
      pollFriendship();
    }, POLL_INTERVAL_MS);

    // Initial check
    pollFriendship();

    return () => stopPolling();
  }, [state, pollFriendship, stopPolling]);

  const handleRetry = () => {
    attemptDelivery();
  };

  const handleBackToSearch = () => {
    if (eventId) {
      window.location.href = `/${eventId}/search`;
    }
  };

  const handleAddFriend = () => {
    window.open(LINE_OA_URL, '_blank');
  };

  const remainingTime = Math.max(0, POLL_MAX_ATTEMPTS - pollAttempts) * 3;

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

        {state === 'waiting_for_friend' && (
          <>
            <UserPlus className="mx-auto size-12 text-yellow-500" />
            <div className="space-y-2">
              <p className="text-lg font-medium">{th.lineCallback.notFriend}</p>
              <p className="text-sm text-muted-foreground">{th.lineCallback.notFriendHint}</p>
            </div>
            <div className="space-y-3">
              <Button size="sm" onClick={handleAddFriend} className="w-full">
                <ExternalLink className="mr-2 size-4" />
                {th.lineCallback.addFriendButton}
              </Button>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{th.lineCallback.checkingFriend}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {remainingTime > 0 && `(${Math.floor(remainingTime / 60)}:${String(remainingTime % 60).padStart(2, '0')})`}
              </p>
            </div>
          </>
        )}

        {state === 'checking_friend' && (
          <>
            <Loader2 className="mx-auto size-12 animate-spin text-primary" />
            <p className="text-lg font-medium">{th.lineCallback.delivering}</p>
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
