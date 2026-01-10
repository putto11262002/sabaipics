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

      // Debug: Log token status
      console.log("Token exists:", !!token);

      if (!token) {
        throw new Error("Not authenticated. Please sign in and try again.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/credit-packages/checkout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
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
