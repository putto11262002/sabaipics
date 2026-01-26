import { createBrowserRouter, Navigate } from 'react-router';
import { SignedIn, SignedOut } from '@sabaipics/auth/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ConsentGate } from './components/auth/ConsentGate';
import { SignInPage } from './routes/sign-in';
import { SignUpPage } from './routes/sign-up';
import { OnboardingPage } from './routes/onboarding';
import { DashboardPage } from './routes/dashboard';
import { CreditPackagesPage } from './routes/credits/packages';
import { CreditSuccessPage } from './routes/credits/success';
import EventsPage from './routes/events';
import EventDetailLayout from './routes/events/[id]/layout';
import EventDetailsTab from './routes/events/[id]/details';
import EventUploadTab from './routes/events/[id]/upload';
import EventStatisticsTab from './routes/events/[id]/statistics';
import EventPhotosTab from './routes/events/[id]/photos';
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

  // Onboarding route (auth required, no consent required)
  {
    path: '/onboarding',
    element: (
      <ProtectedRoute>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },

  // Credits routes (auth + consent required, no sidebar)
  {
    path: '/credits',
    element: (
      <ProtectedRoute>
        <ConsentGate />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'packages',
        element: <CreditPackagesPage />,
      },
      {
        path: 'success',
        element: <CreditSuccessPage />,
      },
    ],
  },

  // Protected routes (auth + consent required)
  {
    element: (
      <ProtectedRoute>
        <ConsentGate>
          <SidebarLayout />
        </ConsentGate>
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
