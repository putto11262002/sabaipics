import { SignIn } from "@/auth/react";

export function SignInPage() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<SignIn
				routing="path"
				path="/sign-in"
				signUpUrl="/sign-up"
			/>
		</div>
	);
}
