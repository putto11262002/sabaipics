import { useState } from 'react';
import {
	Trash2,
	ImageOff,
	Clock,
	AlertTriangle,
	CalendarOff,
	HardDrive,
	UserMinus,
	Coins,
	type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Spinner } from '@/shared/components/ui/spinner';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/shared/components/ui/card';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import {
	useUploadsHardDelete,
	useUploadsCleanOriginals,
	useUploadsExpirePending,
	usePipelineStuckJobs,
	useEventsSoftDeleteExpired,
	useEventsHardDeleteTrashed,
	usePhotographersCleanup,
	useCreditsReconcile,
	useUploadsHardDeleteCount,
	useUploadsCleanOriginalsCount,
	useUploadsExpirePendingCount,
	usePipelineStuckJobsCount,
	useEventsSoftDeleteExpiredCount,
	useEventsHardDeleteTrashedCount,
	usePhotographersCleanupCount,
	useCreditsReconcileCount,
} from '../../hooks/cleanup/use-cleanup';

// =============================================================================
// Types
// =============================================================================

interface CleanupAction {
	id: string;
	title: string;
	description: string;
	icon: LucideIcon;
	destructive: boolean;
	category: 'uploads' | 'pipeline' | 'events' | 'photographers' | 'credits';
}

const CLEANUP_ACTIONS: CleanupAction[] = [
	{
		id: 'uploads-hard-delete',
		title: 'Hard-delete failed uploads',
		description: 'Permanently delete all failed and expired upload intents with their R2 objects.',
		icon: Trash2,
		destructive: true,
		category: 'uploads',
	},
	{
		id: 'uploads-clean-originals',
		title: 'Clean completed originals',
		description: 'Delete original R2 upload objects for all completed intents (keeps normalized JPEGs).',
		icon: ImageOff,
		destructive: false,
		category: 'uploads',
	},
	{
		id: 'uploads-expire-pending',
		title: 'Expire pending uploads',
		description: 'Mark all pending/processing upload intents as expired.',
		icon: Clock,
		destructive: false,
		category: 'uploads',
	},
	{
		id: 'pipeline-stuck-jobs',
		title: 'Recover stuck jobs',
		description: 'Mark all stuck submitted pipeline jobs as failed (retryable) and refund credits.',
		icon: AlertTriangle,
		destructive: false,
		category: 'pipeline',
	},
	{
		id: 'events-soft-delete-expired',
		title: 'Soft-delete expired events',
		description: 'Soft-delete all events past their expiry date.',
		icon: CalendarOff,
		destructive: false,
		category: 'events',
	},
	{
		id: 'events-hard-delete-trashed',
		title: 'Hard-delete trashed events',
		description: 'Permanently delete all trashed events and their data (R2, DB). Irreversible.',
		icon: HardDrive,
		destructive: true,
		category: 'events',
	},
	{
		id: 'photographers-cleanup',
		title: 'Clean deleted photographers',
		description: 'Delete all operational data for soft-deleted photographers (keeps audit records).',
		icon: UserMinus,
		destructive: true,
		category: 'photographers',
	},
	{
		id: 'credits-reconcile',
		title: 'Reconcile credit balances',
		description: 'Force recompute cached credit balances for all stale photographers.',
		icon: Coins,
		destructive: false,
		category: 'credits',
	},
];

const CATEGORIES = [
	{ key: 'uploads', label: 'Uploads' },
	{ key: 'pipeline', label: 'Pipeline' },
	{ key: 'events', label: 'Events' },
	{ key: 'photographers', label: 'Photographers' },
	{ key: 'credits', label: 'Credits' },
] as const;

// =============================================================================
// Page
// =============================================================================

function CleanupPage() {
	const [confirmAction, setConfirmAction] = useState<CleanupAction | null>(null);

	// Count queries
	const uploadsHardDeleteCount = useUploadsHardDeleteCount();
	const uploadsCleanOriginalsCount = useUploadsCleanOriginalsCount();
	const uploadsExpirePendingCount = useUploadsExpirePendingCount();
	const pipelineStuckJobsCount = usePipelineStuckJobsCount();
	const eventsSoftDeleteExpiredCount = useEventsSoftDeleteExpiredCount();
	const eventsHardDeleteTrashedCount = useEventsHardDeleteTrashedCount();
	const photographersCleanupCount = usePhotographersCleanupCount();
	const creditsReconcileCount = useCreditsReconcileCount();

	// Mutations
	const uploadsHardDelete = useUploadsHardDelete();
	const uploadsCleanOriginals = useUploadsCleanOriginals();
	const uploadsExpirePending = useUploadsExpirePending();
	const pipelineStuckJobs = usePipelineStuckJobs();
	const eventsSoftDeleteExpired = useEventsSoftDeleteExpired();
	const eventsHardDeleteTrashed = useEventsHardDeleteTrashed();
	const photographersCleanup = usePhotographersCleanup();
	const creditsReconcile = useCreditsReconcile();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mutations: Record<string, { mutate: (v: void, opts: any) => void; isPending: boolean }> = {
		'uploads-hard-delete': uploadsHardDelete,
		'uploads-clean-originals': uploadsCleanOriginals,
		'uploads-expire-pending': uploadsExpirePending,
		'pipeline-stuck-jobs': pipelineStuckJobs,
		'events-soft-delete-expired': eventsSoftDeleteExpired,
		'events-hard-delete-trashed': eventsHardDeleteTrashed,
		'photographers-cleanup': photographersCleanup,
		'credits-reconcile': creditsReconcile,
	};

	const counts: Record<string, number | undefined> = {
		'uploads-hard-delete': uploadsHardDeleteCount.data?.data.count,
		'uploads-clean-originals': uploadsCleanOriginalsCount.data?.data.count,
		'uploads-expire-pending': uploadsExpirePendingCount.data?.data.count,
		'pipeline-stuck-jobs': pipelineStuckJobsCount.data?.data.count,
		'events-soft-delete-expired': eventsSoftDeleteExpiredCount.data?.data.count,
		'events-hard-delete-trashed': eventsHardDeleteTrashedCount.data?.data.count,
		'photographers-cleanup': photographersCleanupCount.data?.data.count,
		'credits-reconcile': creditsReconcileCount.data?.data.count,
	};

	function handleTrigger(action: CleanupAction) {
		if (action.destructive) {
			setConfirmAction(action);
			return;
		}
		runAction(action);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function runAction(action: CleanupAction) {
		setConfirmAction(null);
		const mutation = mutations[action.id];
		mutation.mutate(undefined, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onSuccess: (data: any) => {
				const result = data?.data ?? data;
				const summary = Object.entries(result)
					.filter(([k]) => k !== 'results')
					.map(([k, v]) => `${k}: ${v}`)
					.join(', ');
				toast.success(action.title, { description: summary || 'Done' });
			},
			onError: (e: { message: string }) => {
				toast.error(action.title, { description: e.message });
			},
		});
	}

	return (
		<>
			<SidebarPageHeader
				breadcrumbs={[
					{ label: 'Settings', href: '/settings' },
					{ label: 'Cleanup' },
				]}
			/>

			<div className="mx-auto max-w-6xl space-y-6 p-4">
				<div>
					<h2 className="text-base font-medium">Cleanup Triggers</h2>
					<p className="text-sm text-muted-foreground">
						Manually trigger cleanup jobs that normally run on cron schedules. Time-based delays are skipped.
					</p>
				</div>

				{CATEGORIES.map(({ key, label }) => {
					const actions = CLEANUP_ACTIONS.filter((a) => a.category === key);
					if (actions.length === 0) return null;

					return (
						<div key={key} className="space-y-3">
							<h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
							<div className="grid gap-3 sm:grid-cols-2">
								{actions.map((action) => {
									const mutation = mutations[action.id];
									const count = counts[action.id];
									const Icon = action.icon;

									return (
										<Card key={action.id}>
											<CardHeader className="pb-3">
												<div className="flex items-center justify-between">
													<CardTitle className="flex items-center gap-2 text-sm">
														<Icon className="size-4 text-muted-foreground" />
														{action.title}
													</CardTitle>
													{count !== undefined && (
														<Badge variant={count > 0 ? 'secondary' : 'outline'}>
															{count}
														</Badge>
													)}
												</div>
												<CardDescription className="text-xs">
													{action.description}
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-0">
												<Button
													size="sm"
													variant={action.destructive ? 'destructive' : 'outline'}
													disabled={mutation.isPending || count === 0}
													onClick={() => handleTrigger(action)}
												>
													{mutation.isPending && <Spinner className="mr-1 size-3" />}
													{mutation.isPending ? 'Running...' : 'Run'}
												</Button>
											</CardContent>
										</Card>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>

			<AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmAction?.description} This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => confirmAction && runAction(confirmAction)}
						>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export { CleanupPage as Component };
