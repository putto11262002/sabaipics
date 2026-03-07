import { createBrowserRouter, Navigate, Outlet } from 'react-router';

import { SignedIn, SignedOut } from '@/auth/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SignInPage } from './routes/sign-in';
import { SignUpPage } from './routes/sign-up';
import { DesktopAuthPage } from './routes/auth/desktop';
import { DashboardPage } from './routes/dashboard';
import { CreditSuccessPage } from './routes/credits/success';
import EventsPage from './routes/events';
import EventDetailLayout from './routes/events/[id]/layout';
import EventDetailsTab from './routes/events/[id]/details';
import EventUploadTab from './routes/events/[id]/upload';
// import EventStatisticsTab from './routes/events/[id]/statistics';
import EventPhotosTab from './routes/events/[id]/photos';
import EventColorTab from './routes/events/[id]/color';
import EventFtpTab from './routes/events/[id]/ftp';
import EventSlideshowTab from './routes/events/[id]/slideshow';
import StudioLutsPage from './routes/studio/luts';
import StudioLutPreviewPage from './routes/studio/luts/preview';
import LineDeliveryPage from './routes/line-delivery';
import StudioAutoEditPage from './routes/studio/auto-edit';
import StudioAutoEditNewPage from './routes/studio/auto-edit/new';
import SettingsLayout from './routes/settings/layout';
import SettingsProfileTab from './routes/settings/profile';
import SettingsCreditsTab from './routes/settings/credits';
import SettingsUsageTab from './routes/settings/usage';
import { SidebarLayout } from './components/shell/sidebar-layout';
import RouteErrorFallback from './components/errors/RouteErrorFallback';
export const router = createBrowserRouter([
  // Public routes
  {
    path: '/sign-in/*',
    element: <SignInPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/sign-up/*',
    element: <SignUpPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/auth/desktop',
    element: <DesktopAuthPage />,
    errorElement: <RouteErrorFallback />,
  },

  // Slideshow editor (auth required, no sidebar)
  {
    path: '/events/:id/slideshow-editor',
    element: (
      <ProtectedRoute>
        <EventSlideshowTab />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
  },

  // LUT preview (auth required, no sidebar)
  {
    path: '/studio/luts/:id/preview',
    element: (
      <ProtectedRoute>
        <StudioLutPreviewPage />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
  },

  // Auto-edit preset editor (auth required, no sidebar)
  {
    path: '/studio/auto-edit/new',
    element: (
      <ProtectedRoute>
        <StudioAutoEditNewPage />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/studio/auto-edit/:id/edit',
    element: (
      <ProtectedRoute>
        <StudioAutoEditNewPage />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
  },

  // Settings (auth required, own sidebar)
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <Navigate to="profile" replace /> },
      { path: 'profile', element: <SettingsProfileTab /> },
      { path: 'credits', element: <SettingsCreditsTab /> },
      { path: 'usage', element: <SettingsUsageTab /> },
    ],
  },

  // Credits routes (auth required, no sidebar)
  {
    path: '/credits',
    element: (
      <ProtectedRoute>
        <Outlet />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      // Redirect /credits to /settings/credits
      { index: true, element: <Navigate to="/settings/credits" replace /> },
      { path: 'purchases', element: <Navigate to="/settings/credits" replace /> },
      { path: 'usage', element: <Navigate to="/settings/credits" replace /> },
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
    errorElement: <RouteErrorFallback />,
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
        path: '/line-delivery',
        element: <LineDeliveryPage />,
      },
      {
        path: '/studio/auto-edit',
        element: <StudioAutoEditPage />,
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
    errorElement: <RouteErrorFallback />,
  },
]);
