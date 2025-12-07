import { useAuth } from "@sabaipics/auth/react";
import { Navigate, useLocation } from "react-router";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { isLoaded, isSignedIn } = useAuth();
	const location = useLocation();

	if (!isLoaded) {
		return <div>Loading...</div>; // TODO: skeleton
	}

	if (!isSignedIn) {
		return <Navigate to="/sign-in" state={{ from: location }} replace />;
	}

	return <>{children}</>;
}
