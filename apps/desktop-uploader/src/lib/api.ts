import { hc } from "hono/client"
import type { AppType } from "@sabaipics/api"

export const api = hc<AppType>(import.meta.env.VITE_API_URL)

export function createAuthClient(token: string) {
  return hc<AppType>(import.meta.env.VITE_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  })
}
