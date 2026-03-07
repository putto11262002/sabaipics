import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router';
import type { EventLayoutContext } from '../../components/EventLayout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { searchPhotos, getEventPublic, getSessionState, acceptConsent, type SearchResult } from '../../lib/api';
import { resizeImage } from '../../lib/resize-image';
import { ConsentStep } from '../../components/ConsentStep';
import { CameraStep } from '../../components/CameraStep';
import { SearchingStep } from '../../components/SearchingStep';
import { ErrorStep } from '../../components/ErrorStep';
import { HomeStep } from '../../components/HomeStep';
import { BottomNav } from '../../components/BottomNav';

type PageState = 'loading' | 'consent' | 'home' | 'camera' | 'searching' | 'error';

type ErrorType = 'NO_FACE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'SERVER' | null;

export function SearchPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setHideBanner } = useOutletContext<EventLayoutContext>();
  const [state, setState] = useState<PageState>('loading');
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  // Track the selfie file or existing selfie ID for the current search
  const selfieFileRef = useRef<File | null>(null);
  const selfieIdRef = useRef<string | null>(null);

  // Hide event banner when camera is fullscreen
  useEffect(() => {
    setHideBanner(state === 'camera');
  }, [state, setHideBanner]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    };
  }, [selfiePreview]);

  // Check session state for existing consent + selfie
  const sessionQuery = useQuery({
    queryKey: ['participant', 'session'],
    queryFn: getSessionState,
    staleTime: 60_000,
  });

  // Route to correct initial state based on session
  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (state !== 'loading') return;

    const session = sessionQuery.data;
    if (session?.hasConsent) {
      setState('home');
    } else {
      setState('consent');
    }
  }, [sessionQuery.isLoading, sessionQuery.data, state]);

  // Fetch event info
  const eventQuery = useQuery({
    queryKey: ['event', eventId, 'public'],
    queryFn: () => getEventPublic(eventId!),
    enabled: !!eventId,
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!eventId) throw new Error('Missing data');

      if (selfieIdRef.current) {
        return searchPhotos(eventId, { selfieId: selfieIdRef.current }, true);
      }
      if (selfieFileRef.current) {
        return searchPhotos(eventId, { selfie: selfieFileRef.current }, true);
      }
      throw new Error('Missing selfie');
    },
    onSuccess: (result: SearchResult) => {
      // Navigate to results route with data in state
      navigate(`/${eventId}/results/${result.searchId}`, {
        state: result,
      });
      // Invalidate session to pick up new selfie
      queryClient.invalidateQueries({ queryKey: ['participant', 'session'] });
    },
    onError: (error: Error) => {
      const code = error.message;
      if (code === 'NO_FACE_DETECTED' || code === 'UNPROCESSABLE') {
        setErrorType('NO_FACE');
      } else if (code === 'RATE_LIMITED') {
        setErrorType('RATE_LIMITED');
      } else if (code === 'NOT_FOUND') {
        setErrorType('NOT_FOUND');
      } else {
        setErrorType('SERVER');
      }
      setState('error');
    },
  });

  const handleConsentAccept = useCallback(async () => {
    await acceptConsent();
    queryClient.invalidateQueries({ queryKey: ['participant', 'session'] });
    setState('home');
  }, [queryClient]);

  // Camera captured a selfie -> resize + immediately search
  const handleCapture = useCallback(
    async (file: File) => {
      const resized = await resizeImage(file);
      selfieFileRef.current = resized;
      selfieIdRef.current = null;
      setSelfiePreview(URL.createObjectURL(resized));
      setState('searching');
      searchMutation.mutate();
    },
    [searchMutation],
  );

  // Search with a specific selfie by ID
  const handleSearchWithSelfie = useCallback((selfieId: string) => {
    const selfie = sessionQuery.data?.selfies.find((s) => s.id === selfieId);
    if (!selfie) return;
    selfieIdRef.current = selfie.id;
    selfieFileRef.current = null;
    setSelfiePreview(selfie.thumbnailUrl);
    setState('searching');
    searchMutation.mutate();
  }, [sessionQuery.data, searchMutation]);

  const handleNewSelfie = useCallback(() => {
    selfieFileRef.current = null;
    selfieIdRef.current = null;
    setState('camera');
  }, []);

  const handleRetry = useCallback(() => {
    setErrorType(null);
    setState('home');
  }, []);

  const handleBack = useCallback(() => {
    if (state === 'camera') {
      setState('home');
    } else if (state === 'error') {
      handleRetry();
    }
  }, [state, handleRetry]);

  if (!eventId) {
    return <ErrorStep type="NOT_FOUND" onRetry={() => window.location.reload()} />;
  }

  return (
    <div className={state === 'camera' ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : 'flex flex-1 min-h-0 flex-col pb-14'}>
      {state === 'loading' && null}

      {state === 'consent' && (
        <ConsentStep
          eventName={eventQuery.data?.name}
          isLoading={eventQuery.isLoading}
          onContinue={handleConsentAccept}
        />
      )}

      {state === 'home' && (
        <>
          <HomeStep
            selfies={sessionQuery.data?.selfies ?? []}
            onSearch={handleSearchWithSelfie}
            onNewSelfie={handleNewSelfie}
          />
          <BottomNav eventId={eventId} />
        </>
      )}

      {state === 'camera' && <CameraStep onCapture={handleCapture} onBack={handleBack} />}

      {state === 'searching' && <SearchingStep />}

      {state === 'error' && (
        <ErrorStep
          type={errorType}
          onRetry={errorType === 'NO_FACE' ? handleNewSelfie : handleRetry}
        />
      )}
    </div>
  );
}
