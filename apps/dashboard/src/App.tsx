import { Routes, Route, Navigate } from "react-router";
import { SignedIn, SignedOut } from "@sabaipics/auth/react";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ConsentGate } from "./components/auth/ConsentGate";
import { SignInPage } from "./routes/sign-in";
import { SignUpPage } from "./routes/sign-up";
import { OnboardingPage } from "./routes/onboarding";
import { DashboardPage } from "./routes/dashboard";
import { Layout } from "./components/Layout";

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Onboarding route (auth required, no consent required) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* Protected routes (auth + consent required) */}
      <Route
        element={
          <ProtectedRoute>
            <ConsentGate>
              <Layout />
            </ConsentGate>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Future: /events, /settings, etc. */}
      </Route>

      {/* Root redirect */}
      <Route
        path="/"
        element={
          <>
            <SignedIn>
              <Navigate to="/dashboard" replace />
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />
    </Routes>
  );
}
