import { createBrowserRouter } from 'react-router';
import { SearchPage } from './routes/events/search';

export const router = createBrowserRouter([
  {
    path: '/:eventId/search',
    element: <SearchPage />,
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
