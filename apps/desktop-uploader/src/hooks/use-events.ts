import { useQuery } from "@tanstack/react-query"
import { useAuth } from "../auth/auth-context"
import { createAuthClient } from "../lib/api"

export type Event = {
  id: string
  photographerId: string
  name: string
  startDate: string | null
  endDate: string | null
  qrCodeUrl: string | null
  rekognitionCollectionId: string | null
  expiresAt: string
  createdAt: string
}

type EventsResponse = {
  data: Event[]
}

export function useEvents(page: number = 0, limit: number = 20) {
  const { token, status } = useAuth()

  return useQuery({
    queryKey: ["events", page, limit],
    enabled: status === "signed_in" && !!token,
    queryFn: async () => {
      const client = createAuthClient(token!)
      const res = await client.events.$get({
        query: { page: String(page), limit: String(limit) },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      return (await res.json()) as EventsResponse
    },
    staleTime: 1000 * 30,
  })
}
