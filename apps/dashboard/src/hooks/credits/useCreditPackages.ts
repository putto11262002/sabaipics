import { useQuery } from "@tanstack/react-query";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceThb: number; // in satang (smallest unit)
}

interface CreditPackagesResponse {
  data: CreditPackage[];
}

export function useCreditPackages() {
  return useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<CreditPackagesResponse>;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes (packages rarely change)
    refetchOnWindowFocus: false, // No need to refetch on focus
  });
}
