import { createBrowserRouter, Navigate } from 'react-router';
import { SidebarLayout } from './components/shell/sidebar-layout';

export const router = createBrowserRouter([
  {
    element: <SidebarLayout />,
    children: [
      {
        path: '/users',
        lazy: () => import('./routes/users'),
      },
      {
        path: '/users/:id',
        lazy: () => import('./routes/users/[id]'),
      },
      {
        path: '/gift-codes',
        lazy: () => import('./routes/gift-codes'),
      },
      {
        path: '/gift-codes/:id',
        lazy: () => import('./routes/gift-codes/[id]'),
      },
      {
        path: '/events',
        lazy: () => import('./routes/events'),
      },
      {
        path: '/events/:id',
        lazy: () => import('./routes/events/[id]'),
      },
      {
        path: '/announcements',
        lazy: () => import('./routes/announcements'),
      },
      {
        path: '/announcements/:id',
        lazy: () => import('./routes/announcements/[id]'),
      },
      {
        path: '/settings',
        lazy: () => import('./routes/settings'),
      },
    ],
  },

  // Root redirect
  {
    path: '/',
    element: <Navigate to="/gift-codes" replace />,
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
