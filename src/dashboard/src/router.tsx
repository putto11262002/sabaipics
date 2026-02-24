import { createBrowserRouter, Navigate, Outlet } from 'react-router';

import { SignedIn, SignedOut } from '@/auth/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SignInPage } from './routes/sign-in';
import { SignUpPage } from './routes/sign-up';
import { DesktopAuthPage } from './routes/auth/desktop';
import { DashboardPage } from './routes/dashboard';
import { CreditSuccessPage } from './routes/credits/success';
import CreditsLayout from './routes/credits/layout';
import CreditPurchasesTab from './routes/credits/purchases';
import CreditUsageTab from './routes/credits/usage';
import EventsPage from './routes/events';
import EventDetailLayout from './routes/events/[id]/layout';
import EventDetailsTab from './routes/events/[id]/details';
import EventUploadTab from './routes/events/[id]/upload';
// import EventStatisticsTab from './routes/events/[id]/statistics';
import EventPhotosTab from './routes/events/[id]/photos';
import EventColorTab from './routes/events/[id]/color';
import EventFtpTab from './routes/events/[id]/ftp';
import EventSlideshowTab from './routes/events/[id]/slideshow';
import SlideshowPreviewPage from './routes/events/[id]/slideshow/preview';
import StudioLutsPage from './routes/studio/luts';
import StudioLutPreviewPage from './routes/studio/luts/preview';
import LineDeliveryPage from './routes/line-delivery';
import StudioAutoEditPage from './routes/studio/auto-edit';
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
        path: '/studio/luts',
        element: <StudioLutsPage />,
      },
      {
        path: '/studio/luts/:id/preview',
        element: <StudioLutPreviewPage />,
      },
      {
        path: '/line-delivery',
        element: <LineDeliveryPage />,
      },
      {
        path: '/studio/auto-edit',
        element: <StudioAutoEditPage />,
      },
      {
        path: '/credits',
        element: <CreditsLayout />,
        children: [
          { index: true, element: <Navigate to="purchases" replace /> },
          { path: 'purchases', element: <CreditPurchasesTab /> },
          { path: 'usage', element: <CreditUsageTab /> },
        ],
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
          // {
          //   path: 'statistics',
          //   element: <EventStatisticsTab />,
          // },
          {
            path: 'photos',
            element: <EventPhotosTab />,
          },
          {
            path: 'color',
            element: <EventColorTab />,
          },
          {
            path: 'ftp',
            element: <EventFtpTab />,
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
