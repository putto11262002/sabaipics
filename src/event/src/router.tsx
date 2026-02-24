import { createBrowserRouter } from 'react-router';
import { SearchPage } from './routes/events/search';
import { LineCallbackPage } from './routes/events/line-callback';
import { PrivacyPage } from './routes/privacy';
import { TermsPage } from './routes/terms';

export const router = createBrowserRouter([
  {
    path: '/:eventId/search',
    element: <SearchPage />,
  },
  {
    path: '/:eventId/line-callback',
    element: <LineCallbackPage />,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
  },
  {
    path: '*',
    element: (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    ),
  },
]);
