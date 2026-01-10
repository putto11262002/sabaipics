import { Navigate, useLocation } from "react-router";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@sabaipics/ui/components/empty";
import { Spinner } from "@sabaipics/ui/components/spinner";
import { useConsentStatus } from "../../hooks/consent/useConsentStatus";

interface ConsentGateProps {
	children: React.ReactNode;
}

/**
 * ConsentGate - Protects routes that require PDPA consent
 *
 * Redirects to /onboarding if:
 * - Photographer doesn't exist yet (webhook hasn't processed)
 * - Photographer exists but hasn't consented
 */
export function ConsentGate({ children }: ConsentGateProps) {
	const { photographerExists, isConsented, isLoading } = useConsentStatus();
	const location = useLocation();

	// Still checking consent status
	if (isLoading) {
		return (
			<Empty className="min-h-screen">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Spinner className="size-5" />
					</EmptyMedia>
					<EmptyTitle>Loading your profile...</EmptyTitle>
					<EmptyDescription>
						Checking your account status. This won't take long.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	// Photographer doesn't exist or hasn't consented - redirect to onboarding
	if (!photographerExists || !isConsented) {
		return (
			<Navigate
				to="/onboarding"
				state={{ from: location }}
				replace
			/>
		);
	}

	// User has consented - render children
	return <>{children}</>;
}
