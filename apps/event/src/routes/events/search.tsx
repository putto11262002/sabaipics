import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { searchPhotos, getEventPublic, type SearchResult } from '@/lib/api';
import { th } from '@/lib/i18n';
import { ConsentStep } from '@/components/ConsentStep';
import { UploadStep } from '@/components/UploadStep';
import { PreviewStep } from '@/components/PreviewStep';
import { SearchingStep } from '@/components/SearchingStep';
import { ResultsStep } from '@/components/ResultsStep';
import { EmptyStep } from '@/components/EmptyStep';
import { ErrorStep } from '@/components/ErrorStep';

type PageState = 'consent' | 'upload' | 'preview' | 'searching' | 'results' | 'empty' | 'error';

type ErrorType = 'NO_FACE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'SERVER' | null;

export function SearchPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [state, setState] = useState<PageState>('consent');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>(null);

  // Check sessionStorage for existing consent in this session
  useEffect(() => {
    const hasConsented = sessionStorage.getItem('pdpa_consent_accepted');
    if (hasConsented === 'true' && state === 'consent') {
      setConsentAccepted(true);
      // Skip to upload immediately if already consented in this session
      setState('upload');
    }
  }, [state]);

  // Fetch event info (name)
  const eventQuery = useQuery({
    queryKey: ['event', eventId, 'public'],
    queryFn: () => getEventPublic(eventId!),
    enabled: !!eventId,
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !selfieFile) throw new Error('Missing data');
      return searchPhotos(eventId, selfieFile, consentAccepted);
    },
    onSuccess: (result) => {
      setSearchResult(result);
      if (result.photos.length === 0) {
        setState('empty');
      } else {
        setState('results');
      }
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

  const handleConsentAccept = useCallback(() => {
    setConsentAccepted(true);
    // Store consent in sessionStorage for this session
    sessionStorage.setItem('pdpa_consent_accepted', 'true');
    setState('upload');
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(th.errors.fileSize.title, {
        description: th.errors.fileSize.description,
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(th.errors.fileType.title, {
        description: th.errors.fileType.description,
      });
      return;
    }

    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setState('preview');
  }, []);

  const handleRetake = useCallback(() => {
    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
    }
    setSelfieFile(null);
    setSelfiePreview(null);
    setState('upload');
  }, [selfiePreview]);

  const handleSearch = useCallback(() => {
    setState('searching');
    searchMutation.mutate();
  }, [searchMutation]);

  const handleRetry = useCallback(() => {
    setErrorType(null);
    setSearchResult(null);
    setState('upload');
  }, []);

  const handleBack = useCallback(() => {
    switch (state) {
      case 'upload':
        setState('consent');
        setConsentAccepted(false);
        break;
      case 'preview':
        handleRetake();
        break;
      case 'results':
      case 'empty':
      case 'error':
        handleRetry();
        break;
    }
  }, [state, handleRetake, handleRetry]);

  if (!eventId) {
    return <ErrorStep type="NOT_FOUND" onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {state === 'consent' && (
        <ConsentStep
          eventName={eventQuery.data?.name}
          isLoading={eventQuery.isLoading}
          accepted={consentAccepted}
          onAcceptChange={setConsentAccepted}
          onContinue={handleConsentAccept}
        />
      )}

      {state === 'upload' && <UploadStep onFileSelect={handleFileSelect} onBack={handleBack} />}

      {state === 'preview' && selfiePreview && (
        <PreviewStep
          previewUrl={selfiePreview}
          onSearch={handleSearch}
          onRetake={handleRetake}
          onBack={handleBack}
        />
      )}

      {state === 'searching' && <SearchingStep />}

      {state === 'results' && searchResult && eventId && (
        <ResultsStep eventId={eventId} photos={searchResult.photos} onSearchAgain={handleRetry} />
      )}

      {state === 'empty' && <EmptyStep onRetry={handleRetry} />}

      {state === 'error' && (
        <ErrorStep
          type={errorType}
          onRetry={errorType === 'NO_FACE' ? handleRetake : handleRetry}
        />
      )}
    </div>
  );
}
