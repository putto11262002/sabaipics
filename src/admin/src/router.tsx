import { createBrowserRouter, Navigate } from 'react-router';
import { SidebarLayout } from './components/shell/sidebar-layout';

export const router = createBrowserRouter([
  {
    element: <SidebarLayout />,
    children: [
      {
        path: '/credit-packages',
        lazy: () => import('./routes/credit-packages'),
      },
      {
        path: '/users',
        lazy: () => import('./routes/users'),
      },
      {
        path: '/users/:id',
        lazy: () => import('./routes/users/[id]'),
      },
    ],
  },

  // Root redirect
  {
    path: '/',
    element: <Navigate to="/credit-packages" replace />,
  },

  // 404 catch-all
  {
    path: '*',
    element: (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    ),
  },
]);
