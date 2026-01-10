import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

interface CheckoutRequest {
  packageId: string;
}

interface CheckoutResponse {
  data: {
    checkoutUrl: string;
    sessionId: string;
  };
}

interface CheckoutError {
  error: {
    code: string;
    message: string;
  };
}

export function usePurchaseCheckout() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async (request: CheckoutRequest) => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/checkout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          credentials: "include",
        },
      );

      if (!response.ok) {
        const errorData = (await response.json()) as CheckoutError;
        throw new Error(
          errorData.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return response.json() as Promise<CheckoutResponse>;
    },
  });
}
