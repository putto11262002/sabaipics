import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSlideshowData } from '../lib/api';

/**
 * Extracts eventId from the current URL path.
 * Routes are: /:eventId/search, /:eventId/slideshow, /:eventId/line-callback
 */
function getEventIdFromPath(): string | null {
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  // First segment should be the eventId (UUID format)
  const eventId = segments[0];
  // Basic UUID validation
  if (eventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return eventId;
  }
  return null;
}

/**
 * Provider that fetches event theme settings and injects CSS variables.
 * This ensures the entire event app uses the customized colors.
 */
export function EventThemeProvider({ children }: { children: React.ReactNode }) {
  const eventId = getEventIdFromPath();

  const { data: themeData } = useQuery({
    queryKey: ['event-theme', eventId],
    queryFn: () => getSlideshowData(eventId!),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });

  // Inject CSS variables when theme data changes
  useEffect(() => {
    if (!themeData?.config) return;

    const root = document.documentElement;
    const { primaryColor, background } = themeData.config;

    // Set CSS variables - convert hex to OKLCH for consistency
    // Note: We're setting the hex directly since the templates also use hex
    if (primaryColor) {
      root.style.setProperty('--primary', primaryColor);
    }
    if (background) {
      root.style.setProperty('--background', background);
    }

    // Cleanup on unmount (reset to defaults)
    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--background');
    };
  }, [themeData?.config]);

  return <>{children}</>;
}
