import { Link } from "react-router";
import { differenceInDays, formatDistanceToNow, parseISO } from "date-fns";
import {
	AlertCircle,
	Calendar,
	CreditCard,
	Image as ImageIcon,
	RefreshCw,
	Smile,
} from "lucide-react";

import { PageHeader } from "../../components/shell/page-header";
import { useDashboardData } from "../../hooks/dashboard/useDashboardData";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { Button } from "@sabaipics/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@sabaipics/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@sabaipics/ui/components/empty";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Spinner } from "@sabaipics/ui/components/spinner";

export function DashboardPage() {
	const { data, isLoading, error, refetch, isRefetching } = useDashboardData();

	const dashboardData = data?.data;

	// Helper to check if credits are expiring soon (within 7 days)
	const isExpiringSoon = (expiry: string | null) => {
		if (!expiry) return false;
		const days = differenceInDays(parseISO(expiry), new Date());
		return days <= 7 && days >= 0;
	};

	return (
		<>
			<PageHeader breadcrumbs={[{ label: "Dashboard" }]}>
				<Button asChild size="sm">
					<Link to="/credits/packages">
						<CreditCard className="mr-2 size-4" />
						Buy Credits
					</Link>
				</Button>
			</PageHeader>

			<div className="flex flex-1 flex-col gap-4 p-4">
				{/* Loading State */}
				{isLoading && (
					<>
						<div className="grid auto-rows-min gap-4 md:grid-cols-3">
							<Skeleton className="h-32 w-full rounded-xl" />
							<Skeleton className="h-32 w-full rounded-xl" />
							<Skeleton className="h-32 w-full rounded-xl" />
						</div>
						<Skeleton className="h-64 w-full rounded-xl" />
					</>
				)}

				{/* Error State */}
				{error && (
					<Alert variant="destructive">
						<AlertCircle className="size-4" />
						<AlertTitle>Error loading dashboard</AlertTitle>
						<AlertDescription className="flex items-center justify-between">
							<span>{error.message}</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => refetch()}
								disabled={isRefetching}
							>
								{isRefetching ? (
									<Spinner className="mr-2 size-3" />
								) : (
									<RefreshCw className="mr-2 size-3" />
								)}
								Retry
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{/* Success State */}
				{dashboardData && (
					<>
						{/* Credit Expiry Warning */}
						{dashboardData.credits.nearestExpiry &&
							isExpiringSoon(dashboardData.credits.nearestExpiry) && (
								<Alert variant="destructive">
									<AlertCircle className="size-4" />
									<AlertTitle>Credits Expiring Soon</AlertTitle>
									<AlertDescription>
										{dashboardData.credits.balance} credits expire on{" "}
										{new Date(dashboardData.credits.nearestExpiry).toLocaleDateString()}.
										Purchase more credits to avoid service interruption.
									</AlertDescription>
								</Alert>
							)}

						{/* Stats Cards Grid */}
						<div className="grid auto-rows-min gap-4 md:grid-cols-3">
							{/* Credit Balance Card */}
							<Card className="@container/card">
								<CardHeader>
									<CardDescription>Credit Balance</CardDescription>
									<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
										{dashboardData.credits.balance} credits
									</CardTitle>
									<CardAction>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => refetch()}
											disabled={isRefetching}
											title="Refresh balance"
										>
											<RefreshCw
												className={`size-4 ${isRefetching ? "animate-spin" : ""}`}
											/>
										</Button>
									</CardAction>
								</CardHeader>
								<CardFooter className="flex-col items-start gap-1.5 text-sm">
									{dashboardData.credits.nearestExpiry ? (
										<div className="text-muted-foreground">
											Expires{" "}
											{formatDistanceToNow(
												parseISO(dashboardData.credits.nearestExpiry),
												{ addSuffix: true }
											)}
										</div>
									) : (
										<div className="text-muted-foreground">
											{dashboardData.credits.balance === 0
												? "Purchase credits to get started"
												: "No expiry"}
										</div>
									)}
								</CardFooter>
							</Card>

							{/* Total Photos Card */}
							<Card className="@container/card">
								<CardHeader>
									<CardDescription>Total Photos</CardDescription>
									<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
										{dashboardData.stats.totalPhotos}
									</CardTitle>
								</CardHeader>
								<CardFooter className="text-sm text-muted-foreground">
									<ImageIcon className="mr-2 size-4" />
									Across all events
								</CardFooter>
							</Card>

							{/* Total Faces Card */}
							<Card className="@container/card">
								<CardHeader>
									<CardDescription>Total Faces</CardDescription>
									<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
										{dashboardData.stats.totalFaces}
									</CardTitle>
								</CardHeader>
								<CardFooter className="text-sm text-muted-foreground">
									<Smile className="mr-2 size-4" />
									Detected and indexed
								</CardFooter>
							</Card>
						</div>

						{/* Events Section */}
						<div className="space-y-4">
							<div className="flex items-start justify-between">
								<div>
									<h2 className="text-lg font-semibold">Recent Events</h2>
									<p className="text-sm text-muted-foreground">
										Your last {dashboardData.events.length} event
										{dashboardData.events.length !== 1 ? "s" : ""}
									</p>
								</div>
								<Button asChild variant="outline" size="sm">
									<Link to="/events">
										<Calendar className="mr-2 size-4" />
										View All Events
									</Link>
								</Button>
							</div>

							{dashboardData.events.length === 0 ? (
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<Calendar className="size-12 text-muted-foreground" />
										</EmptyMedia>
										<EmptyTitle>No events yet</EmptyTitle>
										<EmptyDescription>
											Create your first event to start organizing and sharing photos
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<div className="space-y-2">
									{dashboardData.events.map((event) => (
										<div
											key={event.id}
											className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
										>
											<div className="flex-1 space-y-1">
												<div className="font-semibold">{event.name}</div>
												<div className="text-sm text-muted-foreground">
													Created {formatDistanceToNow(parseISO(event.createdAt))} ago •
													Expires {formatDistanceToNow(parseISO(event.expiresAt))} from now
												</div>
											</div>
											<div className="flex gap-6 text-center">
												<div>
													<div className="text-2xl font-bold tabular-nums">
														{event.photoCount}
													</div>
													<div className="text-xs text-muted-foreground">Photos</div>
												</div>
												<div>
													<div className="text-2xl font-bold tabular-nums">
														{event.faceCount}
													</div>
													<div className="text-xs text-muted-foreground">Faces</div>
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</>
	);
}
