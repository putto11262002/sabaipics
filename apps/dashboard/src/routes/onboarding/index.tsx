import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@sabaipics/auth/react";
import { AlertTriangle } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@sabaipics/uiv2/components/empty";
import { Spinner } from "@sabaipics/uiv2/components/spinner";
import { Button } from "@sabaipics/uiv2/components/button";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/uiv2/components/alert";
import { PDPAConsentModal } from "./_components/PDPAConsentModal";
import { useConsentStatus } from "../../hooks/consent/useConsentStatus";

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL = 1000;

export function OnboardingPage() {
	const navigate = useNavigate();
	const { signOut } = useAuth();
	const [showModal, setShowModal] = useState(false);
	const [showDecline, setShowDecline] = useState(false);
	const [pollAttempts, setPollAttempts] = useState(0);
	const [hasTimeout, setHasTimeout] = useState(false);

	// Check consent status
	const { photographerExists, isConsented, refetch } = useConsentStatus();

	// Poll for photographer record with manual interval
	useEffect(() => {
		// Stop polling if photographer exists or we've timed out
		if (photographerExists || hasTimeout) return;

		if (pollAttempts >= MAX_POLL_ATTEMPTS) {
			setHasTimeout(true);
			return;
		}

		const timer = setTimeout(() => {
			refetch();
			setPollAttempts((p) => p + 1);
		}, POLL_INTERVAL);

		return () => clearTimeout(timer);
	}, [photographerExists, pollAttempts, hasTimeout, refetch]);

	// Handle state transitions when photographer exists
	useEffect(() => {
		if (!photographerExists) return;

		if (isConsented) {
			// Already consented, go to dashboard
			navigate("/dashboard", { replace: true });
		} else {
			// Show consent modal
			setShowModal(true);
		}
	}, [photographerExists, isConsented, navigate]);

	// Handle sign out
	const handleSignOut = async () => {
		await signOut();
		navigate("/sign-in", { replace: true });
	};

	// Timeout state
	if (hasTimeout) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-md space-y-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Account Setup Timeout</AlertTitle>
						<AlertDescription>
							We're taking longer than expected to set up your account. Please
							try again.
						</AlertDescription>
					</Alert>
					<Button
						onClick={() => {
							setPollAttempts(0);
							setHasTimeout(false);
							refetch();
						}}
						className="w-full"
					>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	// Decline state
	if (showDecline) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-md space-y-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Consent Required</AlertTitle>
						<AlertDescription>
							You must accept the PDPA consent terms to use SabaiPics. Without
							consent, we cannot process your photos.
						</AlertDescription>
					</Alert>
					<div className="flex gap-3">
						<Button
							variant="outline"
							onClick={() => {
								setShowDecline(false);
								setShowModal(true);
							}}
							className="flex-1"
						>
							Try Again
						</Button>
						<Button
							variant="destructive"
							onClick={handleSignOut}
							className="flex-1"
						>
							Use Different Account
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Loading state (polling for photographer record)
	return (
		<Empty className="min-h-screen">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Spinner className="size-5" />
				</EmptyMedia>
				<EmptyTitle>Setting up your account...</EmptyTitle>
				<EmptyDescription>
					We're preparing your photographer profile. This usually takes a few
					seconds.
				</EmptyDescription>
			</EmptyHeader>

			{/* Modal appears once photographer exists */}
			<PDPAConsentModal
				open={showModal}
				onAcceptSuccess={() => {
					refetch();
					navigate("/dashboard", { replace: true });
				}}
				onDecline={() => {
					setShowModal(false);
					setShowDecline(true);
				}}
			/>
		</Empty>
	);
}
