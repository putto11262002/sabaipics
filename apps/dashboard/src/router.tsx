import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { SignedIn, SignedOut } from '@sabaipics/auth/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SignInPage } from './routes/sign-in';
import { SignUpPage } from './routes/sign-up';
import { DesktopAuthPage } from './routes/auth/desktop';
import { DesktopAuthCompletePage } from './routes/auth/desktop-complete';
import { DashboardPage } from './routes/dashboard';
import { CreditSuccessPage } from './routes/credits/success';
import EventsPage from './routes/events';
import EventDetailLayout from './routes/events/[id]/layout';
import EventDetailsTab from './routes/events/[id]/details';
import EventUploadTab from './routes/events/[id]/upload';
import EventStatisticsTab from './routes/events/[id]/statistics';
import EventPhotosTab from './routes/events/[id]/photos';
import EventSlideshowTab from './routes/events/[id]/slideshow';
import SlideshowPreviewPage from './routes/events/[id]/slideshow/preview';
import { SidebarLayout } from './components/shell/sidebar-layout';

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/sign-in/*',
    element: <SignInPage />,
  },
  {
    path: '/sign-up/*',
    element: <SignUpPage />,
  },
  {
    path: '/auth/desktop',
    element: <DesktopAuthPage />,
  },
  {
    path: '/auth/desktop/complete',
    element: <DesktopAuthCompletePage />,
  },

  // Slideshow editor (auth required, no sidebar)
  {
    path: '/events/:id/slideshow-editor',
    element: (
      <ProtectedRoute>
        <EventSlideshowTab />
      </ProtectedRoute>
    ),
  },
  // Slideshow preview (auth required, no sidebar)
  {
    path: '/events/:id/slideshow-preview',
    element: (
      <ProtectedRoute>
        <SlideshowPreviewPage />
      </ProtectedRoute>
    ),
  },

  // Credits routes (auth required, no sidebar)
  {
    path: '/credits',
    element: (
      <ProtectedRoute>
        <Outlet />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'success',
        element: <CreditSuccessPage />,
      },
    ],
  },

  // Protected routes (auth required)
  {
    element: (
      <ProtectedRoute>
        <SidebarLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/events',
        element: <EventsPage />,
      },
      {
        path: '/events/:id',
        element: <EventDetailLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="details" replace />,
          },
          {
            path: 'details',
            element: <EventDetailsTab />,
          },
          {
            path: 'upload',
            element: <EventUploadTab />,
          },
          {
            path: 'statistics',
            element: <EventStatisticsTab />,
          },
          {
            path: 'photos',
            element: <EventPhotosTab />,
          },
        ],
      },
    ],
  },

  // Root redirect
  {
    path: '/',
    element: (
      <>
        <SignedIn>
          <Navigate to="/dashboard" replace />
        </SignedIn>
        <SignedOut>
          <Navigate to="/sign-in" replace />
        </SignedOut>
      </>
    ),
  },
]);
