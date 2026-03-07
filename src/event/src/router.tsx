import { createBrowserRouter } from 'react-router';
import { EventLayout } from './components/EventLayout';
import { SearchPage } from './routes/events/search';
import { ResultsPage } from './routes/events/results';
import { PhotosPage } from './routes/events/photos';
import { SettingsPage } from './routes/events/settings';
import { SlideshowPage } from './routes/events/slideshow';
import { LineCallbackPage } from './routes/events/line-callback';
import { PrivacyPage } from './routes/privacy';
import { TermsPage } from './routes/terms';
import { th } from './lib/i18n';
import RouteErrorFallback from './components/errors/RouteErrorFallback';

export const router = createBrowserRouter([
  {
    path: '/:eventId',
    element: <EventLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: 'search', element: <SearchPage /> },
      { path: 'results/:searchId', element: <ResultsPage /> },
      { path: 'photos', element: <PhotosPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'line-callback', element: <LineCallbackPage /> },
    ],
  },
  {
    path: '/:eventId/slideshow',
    element: <SlideshowPage />,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '*',
    element: (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{th.errors.pageNotFound}</p>
      </div>
    ),
  },
]);
