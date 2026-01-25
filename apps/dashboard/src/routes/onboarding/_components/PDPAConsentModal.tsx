import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";
import { Button } from "@sabaipics/uiv2/components/button";
import { Checkbox } from "@sabaipics/uiv2/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@sabaipics/uiv2/components/dialog";
import { ScrollArea } from "@sabaipics/uiv2/components/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/uiv2/components/alert";
import { AlertTriangle } from "lucide-react";
import { Spinner } from "@sabaipics/uiv2/components/spinner";

interface PDPAConsentModalProps {
	open: boolean;
	onAcceptSuccess: () => void;
	onDecline: () => void;
}

export function PDPAConsentModal({
	open,
	onAcceptSuccess,
	onDecline,
}: PDPAConsentModalProps) {
	const [isAgreed, setIsAgreed] = useState(false);
	const { getToken } = useAuth();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async () => {
			const token = await getToken();
			const response = await fetch(
				`${import.meta.env.VITE_API_URL}/consent`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			// 409 means already consented - treat as success
			if (!response.ok && response.status !== 409) {
				throw new Error("Failed to submit consent");
			}

			return response.json();
		},
		onSuccess: () => {
			// Invalidate consent status cache
			queryClient.invalidateQueries({ queryKey: ["consent-status"] });
			onAcceptSuccess();
		},
	});

	return (
		<Dialog open={open} onOpenChange={() => {}} modal>
			<DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>PDPA Consent Required</DialogTitle>
					<DialogDescription>
						We need your consent to process your personal data according to
						Thailand's Personal Data Protection Act (PDPA).
					</DialogDescription>
				</DialogHeader>

				{/* Scrollable PDPA text */}
				<ScrollArea className="h-[300px] border rounded-lg bg-muted/30">
					<div className="p-4 text-sm space-y-3">
						<p>
							<strong>Data Processing & Storage</strong>
							<br />
							SabaiPics processes and stores photos you upload, including facial
							recognition data for matching photos with your appearance.
						</p>

						<p>
							<strong>Your Privacy Rights</strong>
							<br />
							You may request to access, correct, delete, or port your personal
							data at any time by contacting us.
						</p>

						<p>
							<strong>Data Retention</strong>
							<br />
							We retain your photos and metadata as long as your account is
							active. Upon deletion, we remove all personal data within 30 days.
						</p>

						<p>
							<strong>Data Sharing</strong>
							<br />
							We do not share your personal data with third parties without your
							explicit consent.
						</p>

						<p>
							<strong>Security Measures</strong>
							<br />
							We encrypt all data in transit and at rest using industry-standard
							protocols.
						</p>

						<p className="text-muted-foreground italic">
							For full details, see our Privacy Policy and Terms of Service.
						</p>
					</div>
				</ScrollArea>

				{/* Consent checkbox */}
				<div className="flex items-start gap-3">
					<Checkbox
						id="pdpa-consent"
						checked={isAgreed}
						onCheckedChange={(checked) => setIsAgreed(checked === true)}
						disabled={mutation.isPending}
					/>
					<label
						htmlFor="pdpa-consent"
						className="text-sm font-medium leading-relaxed cursor-pointer flex-1"
					>
						I accept the PDPA consent terms and acknowledge that SabaiPics will
						process my personal data as described above.
					</label>
				</div>

				{/* Error state */}
				{mutation.isError && (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>
							Failed to submit consent. Please try again.
						</AlertDescription>
					</Alert>
				)}

				{/* Buttons */}
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={onDecline}
						disabled={mutation.isPending}
					>
						Decline
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={!isAgreed || mutation.isPending}
					>
						{mutation.isPending ? (
							<>
								<Spinner className="mr-2" />
								Accepting...
							</>
						) : (
							"Accept"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
