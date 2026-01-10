import { useAuth } from "@sabaipics/auth/react";
import { Navigate, useLocation } from "react-router";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@sabaipics/ui/components/empty";
import { Spinner } from "@sabaipics/ui/components/spinner";

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
		return <Navigate to="/sign-in" state={{ from: location }} replace />;
	}

	return <>{children}</>;
}
