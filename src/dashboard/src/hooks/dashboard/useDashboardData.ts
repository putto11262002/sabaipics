import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

export interface DashboardEvent {
	id: string;
	name: string;
	photoCount: number;
	faceCount: number;
	createdAt: string;
	expiresAt: string;
	startDate: string | null;
	endDate: string | null;
}

export interface DashboardResponse {
	credits: {
		balance: number;
		nearestExpiry: string | null;
	};
	events: DashboardEvent[];
	stats: {
		totalPhotos: number;
		totalFaces: number;
	};
}

interface DashboardData {
	data: DashboardResponse;
}

export function useDashboardData() {
	const { getToken } = useApiClient();

	return useQuery({
		queryKey: ["dashboard"],
		queryFn: async () => {
			const token = await getToken();
			const response = await fetch(
				`${import.meta.env.VITE_API_URL}/dashboard`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.json() as Promise<DashboardData>;
		},
		staleTime: 1000 * 60, // 1 minute
		refetchOnWindowFocus: true, // Auto-refresh when user returns from Stripe
	});
}
