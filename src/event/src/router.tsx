import { createBrowserRouter } from 'react-router';
import { SearchPage } from './routes/events/search';
import { SlideshowPage } from './routes/events/slideshow';
import { LineCallbackPage } from './routes/events/line-callback';
import { PrivacyPage } from './routes/privacy';
import { TermsPage } from './routes/terms';
import { th } from './lib/i18n';
import RouteErrorFallback from './components/errors/RouteErrorFallback';

export const router = createBrowserRouter([
  {
    path: '/:eventId/search',
    element: <SearchPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/:eventId/slideshow',
    element: <SlideshowPage />,
  },
  {
    path: '/:eventId/line-callback',
    element: <LineCallbackPage />,
    errorElement: <RouteErrorFallback />,
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
