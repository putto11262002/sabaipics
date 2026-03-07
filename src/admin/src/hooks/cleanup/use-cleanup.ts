import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';
import { useAdminQuery } from '../use-admin-query';

// =============================================================================
// Response types
// =============================================================================

type CountResponse = { data: { count: number } };

type UploadsHardDeleteResponse = InferResponseType<
	(typeof api.admin)['cleanup']['uploads']['hard-delete']['$post'],
	SuccessStatusCode
>;

type UploadsCleanOriginalsResponse = InferResponseType<
	(typeof api.admin)['cleanup']['uploads']['clean-originals']['$post'],
	SuccessStatusCode
>;

type UploadsExpirePendingResponse = InferResponseType<
	(typeof api.admin)['cleanup']['uploads']['expire-pending']['$post'],
	SuccessStatusCode
>;

type PipelineStuckJobsResponse = InferResponseType<
	(typeof api.admin)['cleanup']['pipeline']['stuck-jobs']['$post'],
	SuccessStatusCode
>;

type EventsSoftDeleteExpiredResponse = InferResponseType<
	(typeof api.admin)['cleanup']['events']['soft-delete-expired']['$post'],
	SuccessStatusCode
>;

type EventsHardDeleteTrashedResponse = InferResponseType<
	(typeof api.admin)['cleanup']['events']['hard-delete-trashed']['$post'],
	SuccessStatusCode
>;

type PhotographersCleanupResponse = InferResponseType<
	(typeof api.admin)['cleanup']['photographers']['$post'],
	SuccessStatusCode
>;

type CreditsReconcileResponse = InferResponseType<
	(typeof api.admin)['cleanup']['credits']['reconcile']['$post'],
	SuccessStatusCode
>;

// =============================================================================
// Count queries
// =============================================================================

export function useUploadsHardDeleteCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'uploads-hard-delete', 'count'],
		apiFn: (opts) => api.admin.cleanup.uploads['hard-delete'].$get({}, opts),
	});
}

export function useUploadsCleanOriginalsCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'uploads-clean-originals', 'count'],
		apiFn: (opts) => api.admin.cleanup.uploads['clean-originals'].$get({}, opts),
	});
}

export function useUploadsExpirePendingCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'uploads-expire-pending', 'count'],
		apiFn: (opts) => api.admin.cleanup.uploads['expire-pending'].$get({}, opts),
	});
}

export function usePipelineStuckJobsCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'pipeline-stuck-jobs', 'count'],
		apiFn: (opts) => api.admin.cleanup.pipeline['stuck-jobs'].$get({}, opts),
	});
}

export function useEventsSoftDeleteExpiredCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'events-soft-delete-expired', 'count'],
		apiFn: (opts) => api.admin.cleanup.events['soft-delete-expired'].$get({}, opts),
	});
}

export function useEventsHardDeleteTrashedCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'events-hard-delete-trashed', 'count'],
		apiFn: (opts) => api.admin.cleanup.events['hard-delete-trashed'].$get({}, opts),
	});
}

export function usePhotographersCleanupCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'photographers', 'count'],
		apiFn: (opts) => api.admin.cleanup.photographers.$get({}, opts),
	});
}

export function useCreditsReconcileCount() {
	return useAdminQuery<CountResponse>({
		queryKey: ['admin', 'cleanup', 'credits-reconcile', 'count'],
		apiFn: (opts) => api.admin.cleanup.credits.reconcile.$get({}, opts),
	});
}

// =============================================================================
// Mutations
// =============================================================================

function useCleanupMutation<TData>(
	apiFn: (_input: void, opts: { headers: Record<string, string> }) => Promise<any>,
	countQueryKey: string[],
) {
	const queryClient = useQueryClient();
	return useAdminMutation<TData, void>({
		apiFn,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: countQueryKey });
		},
	});
}

export function useUploadsHardDelete() {
	return useCleanupMutation<UploadsHardDeleteResponse>(
		(_input, opts) => api.admin.cleanup.uploads['hard-delete'].$post({}, opts),
		['admin', 'cleanup', 'uploads-hard-delete', 'count'],
	);
}

export function useUploadsCleanOriginals() {
	return useCleanupMutation<UploadsCleanOriginalsResponse>(
		(_input, opts) => api.admin.cleanup.uploads['clean-originals'].$post({}, opts),
		['admin', 'cleanup', 'uploads-clean-originals', 'count'],
	);
}

export function useUploadsExpirePending() {
	return useCleanupMutation<UploadsExpirePendingResponse>(
		(_input, opts) => api.admin.cleanup.uploads['expire-pending'].$post({}, opts),
		['admin', 'cleanup', 'uploads-expire-pending', 'count'],
	);
}

export function usePipelineStuckJobs() {
	return useCleanupMutation<PipelineStuckJobsResponse>(
		(_input, opts) => api.admin.cleanup.pipeline['stuck-jobs'].$post({}, opts),
		['admin', 'cleanup', 'pipeline-stuck-jobs', 'count'],
	);
}

export function useEventsSoftDeleteExpired() {
	return useCleanupMutation<EventsSoftDeleteExpiredResponse>(
		(_input, opts) => api.admin.cleanup.events['soft-delete-expired'].$post({}, opts),
		['admin', 'cleanup', 'events-soft-delete-expired', 'count'],
	);
}

export function useEventsHardDeleteTrashed() {
	return useCleanupMutation<EventsHardDeleteTrashedResponse>(
		(_input, opts) => api.admin.cleanup.events['hard-delete-trashed'].$post({}, opts),
		['admin', 'cleanup', 'events-hard-delete-trashed', 'count'],
	);
}

export function usePhotographersCleanup() {
	return useCleanupMutation<PhotographersCleanupResponse>(
		(_input, opts) => api.admin.cleanup.photographers.$post({}, opts),
		['admin', 'cleanup', 'photographers', 'count'],
	);
}

export function useCreditsReconcile() {
	return useCleanupMutation<CreditsReconcileResponse>(
		(_input, opts) => api.admin.cleanup.credits.reconcile.$post({}, opts),
		['admin', 'cleanup', 'credits-reconcile', 'count'],
	);
}
