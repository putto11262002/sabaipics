import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Maximize, Minimize, AlertCircle } from 'lucide-react';
import {
  SlideshowPlayer,
  type SlideshowTemplateId,
  type SlideshowConfig,
  type SlideshowEvent,
  type SlideshowStats,
  type SlideshowPhoto,
} from '@/shared/slideshow';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { getSlideshowData, getSlideshowPhotos } from '../../lib/api';

const POLL_INTERVAL = 5000; // 5 seconds
const PHOTO_BUFFER_SIZE = 10;
const GUIDE_STORAGE_KEY = 'slideshow_fullscreen_guide_shown';
const GUIDE_DURATION = 5000; // 5 seconds
const CONTROL_HIDE_DELAY = 3000; // 3 seconds

// Image URL builder - photos from API already have full URLs
const imageUrlBuilder = (url: string, _width: number) => url;

export function SlideshowPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch slideshow config and event info
  const {
    data: slideshowData,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['slideshow', eventId],
    queryFn: () => getSlideshowData(eventId!),
    enabled: !!eventId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch photos with polling
  const { data: photosData } = useQuery({
    queryKey: ['slideshow-photos', eventId],
    queryFn: () => getSlideshowPhotos(eventId!),
    enabled: !!eventId,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
  });

  // Track fullscreen state changes
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Show guide on first visit
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!hasSeenGuide) {
      localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
      setShowGuide(true);
      setShowControl(true);
      const timer = setTimeout(() => {
        setShowGuide(false);
        setShowControl(false);
      }, GUIDE_DURATION);
      return () => clearTimeout(timer);
    }
  }, []);

  // Hide control after delay
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!showGuide) {
        setShowControl(false);
      }
    }, CONTROL_HIDE_DELAY);
  }, [showGuide]);

  // Show control and schedule hide
  const showControlTemporarily = useCallback(() => {
    setShowControl(true);
    scheduleHide();
  }, [scheduleHide]);

  // Desktop: show on mouse move, hide after inactivity
  const handleMouseMove = useCallback(() => {
    showControlTemporarily();
  }, [showControlTemporarily]);

  // Mobile: show on tap
  const handleTap = useCallback(() => {
    showControlTemporarily();
  }, [showControlTemporarily]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      if (showGuide) {
        setShowGuide(false);
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  }, [showGuide]);

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to load slideshow</AlertTitle>
          <AlertDescription className="mt-2">
            {error?.message ?? 'Something went wrong. Please try again.'}
          </AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  // Loading state
  if (!eventId || !slideshowData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Build slideshow props from API data
  const event: SlideshowEvent = {
    id: eventId,
    name: slideshowData.event.name ?? 'Event',
    subtitle: slideshowData.event.subtitle,
    logoUrl: slideshowData.event.logoUrl,
  };

  const config: SlideshowConfig = {
    primaryColor: slideshowData.config.primaryColor ?? '#ff6320',
    background: slideshowData.config.background ?? '#fdfdfd',
  };

  const stats: SlideshowStats = {
    photoCount: slideshowData.stats.photoCount ?? 0,
    searchCount: slideshowData.stats.searchCount ?? 0,
    downloadCount: 0, // Not tracked in public endpoint
  };

  const photos: SlideshowPhoto[] = (photosData?.data ?? [])
    .slice(0, PHOTO_BUFFER_SIZE)
    .map((photo) => ({
      id: photo.id,
      r2Key: photo.previewUrl,
      width: photo.width,
      height: photo.height,
      createdAt: new Date().toISOString(), // API doesn't return createdAt
    }));

  const templateId = (slideshowData.config.template as SlideshowTemplateId) ?? 'carousel';

  return (
    <div
      className="h-screen w-screen relative"
      onMouseMove={handleMouseMove}
      onClick={handleTap}
      onTouchStart={handleTap}
    >
      <SlideshowPlayer
        templateId={templateId}
        event={event}
        photos={photos}
        stats={stats}
        config={config}
        qrUrl={`${import.meta.env.VITE_EVENT_URL}/${eventId}/search`}
        imageUrlBuilder={imageUrlBuilder}
      />

      {/* Fullscreen toggle button - shows on hover/tap */}
      <div className="fixed top-4 right-4 z-50">
        {/* Guide tooltip - only shows on first visit */}
        {showGuide && showControl && (
          <div className="absolute top-12 right-0 animate-in fade-in-0 slide-in-from-top-2 duration-300">
            <div className="relative bg-background/95 backdrop-blur-sm text-foreground px-3 py-2 rounded-lg shadow-lg text-sm whitespace-nowrap border">
              Click here to go fullscreen
              <div className="absolute -top-2 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-background/95" />
            </div>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className={`p-2 rounded-full backdrop-blur-md text-muted-foreground hover:text-foreground transition-all bg-muted/50 hover:bg-muted/70 ${
            showControl || showGuide ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${showGuide ? 'animate-pulse' : ''}`}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="size-5" />
          ) : (
            <Maximize className="size-5" />
          )}
        </button>
      </div>
    </div>
  );
}
