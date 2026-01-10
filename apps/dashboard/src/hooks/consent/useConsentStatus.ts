import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";

interface ConsentStatusResponse {
	data: {
		isConsented: boolean;
		consentedAt: string | null;
	};
}

interface UseConsentStatusOptions {
	/** Enable polling with specified interval in ms */
	pollingInterval?: number;
}

export function useConsentStatus(options: UseConsentStatusOptions = {}) {
	const { isSignedIn, getToken } = useAuth();
	const { pollingInterval } = options;

	const query = useQuery({
		queryKey: ["consent-status"],
		queryFn: async () => {
			const token = await getToken();
			const response = await fetch(
				`${import.meta.env.VITE_API_URL}/consent`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			// 403 means photographer not found yet (webhook hasn't processed)
			if (response.status === 403) {
				return { photographerExists: false, isConsented: false, consentedAt: null };
			}

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data: ConsentStatusResponse = await response.json();
			return {
				photographerExists: true,
				isConsented: data.data.isConsented,
				consentedAt: data.data.consentedAt,
			};
		},
		enabled: isSignedIn,
		refetchInterval: pollingInterval,
		refetchIntervalInBackground: false,
	});

	return {
		photographerExists: query.data?.photographerExists ?? false,
		isConsented: query.data?.isConsented ?? false,
		consentedAt: query.data?.consentedAt ?? null,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
