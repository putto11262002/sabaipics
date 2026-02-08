import { useAuth } from "@sabaipics/auth/react";
import { Navigate, useLocation } from "react-router";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@sabaipics/uiv3/components/empty";
import { Spinner } from "@sabaipics/uiv3/components/spinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { isLoaded, isSignedIn } = useAuth();
	const location = useLocation();

	if (!isLoaded) {
		return (
			<Empty className="min-h-screen">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Spinner className="size-5" />
					</EmptyMedia>
					<EmptyTitle>Checking authentication...</EmptyTitle>
					<EmptyDescription>
						Verifying your session. Please wait a moment.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	if (!isSignedIn) {
		// Preserve complete URL including query params for Clerk redirect
		const currentUrl = `${location.pathname}${location.search}`;
		const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`;

		return <Navigate to={signInUrl} replace />;
	}

	return <>{children}</>;
}
