import { createBrowserRouter, Navigate } from 'react-router';
import { SignedIn, SignedOut } from '@sabaipics/auth/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SignInPage } from './routes/sign-in';
import { SignUpPage } from './routes/sign-up';
import { DesktopAuthPage } from './routes/auth/desktop';
import { DashboardPage } from './routes/dashboard';
import { CreditSuccessPage } from './routes/credits/success';
import { CreditsIndexPage } from './routes/credits';
import { PurchasesPage } from './routes/credits/purchases';
import { UsagePage } from './routes/credits/usage';
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

  // Credits routes (auth required, no sidebar for success)
  {
    path: '/credits/success',
    element: (
      <ProtectedRoute>
        <CreditSuccessPage />
      </ProtectedRoute>
    ),
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
        path: '/credits',
        element: <CreditsIndexPage />,
      },
      {
        path: '/credits/purchases',
        element: <PurchasesPage />,
      },
      {
        path: '/credits/usage',
        element: <UsagePage />,
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
