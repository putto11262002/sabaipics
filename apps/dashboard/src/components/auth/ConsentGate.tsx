import { Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useConsentStatus } from "../../hooks/useConsentStatus";

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
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
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
