import { useUser } from "@sabaipics/auth/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@sabaipics/ui/components/card";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { PageHeader } from "../../components/shell/page-header";

export function DashboardPage() {
	const { user } = useUser();
	const { getToken } = useApiClient();

	// Test protected route
	const { data: profile, isLoading, error } = useQuery({
		queryKey: ["profile"],
		queryFn: async () => {
			const token = await getToken();
			const response = await fetch(
				`${import.meta.env.VITE_API_URL}/auth/profile`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.json();
		},
	});

	return (
		<>
			<PageHeader breadcrumbs={[{ label: "Dashboard" }]} />

			<div className="flex flex-1 flex-col gap-4 p-4">
				<div>
					<h1 className="text-2xl font-bold mb-2">Dashboard</h1>
					<p className="text-muted-foreground">
						Welcome back,{" "}
						{user?.firstName || user?.emailAddresses[0]?.emailAddress}!
					</p>
				</div>

				{/* Placeholder cards */}
				<div className="grid auto-rows-min gap-4 md:grid-cols-3">
					<div className="bg-muted/50 aspect-video rounded-xl" />
					<div className="bg-muted/50 aspect-video rounded-xl" />
					<div className="bg-muted/50 aspect-video rounded-xl" />
				</div>

				{/* Test Protected API Call */}
				<Card>
					<CardHeader>
						<CardTitle>Protected API Test</CardTitle>
						<CardDescription>
							Testing authenticated request to /auth/profile
						</CardDescription>
					</CardHeader>
					<CardContent>
						{isLoading && <p>Loading...</p>}

						{error && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error.message}</AlertDescription>
							</Alert>
						)}

						{profile && (
							<div className="space-y-2">
								<Alert>
									<AlertTitle>Success!</AlertTitle>
									<AlertDescription>{profile.message}</AlertDescription>
								</Alert>
								<pre className="bg-slate-100 p-4 rounded text-sm overflow-auto">
									{JSON.stringify(profile, null, 2)}
								</pre>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
