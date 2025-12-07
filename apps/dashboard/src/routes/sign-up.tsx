import { SignUp } from "@sabaipics/auth/react";

export function SignUpPage() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<SignUp
				routing="path"
				path="/sign-up"
				signInUrl="/sign-in"
				afterSignUpUrl="/dashboard"
			/>
		</div>
	);
}
