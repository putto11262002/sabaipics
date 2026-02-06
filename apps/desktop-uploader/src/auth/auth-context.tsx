import React from "react"
import { start, cancel, onUrl, onInvalidUrl } from "@fabianlars/tauri-plugin-oauth"
import { open } from "@tauri-apps/plugin-shell"
import { getStoredToken, setStoredToken } from "../lib/auth-token"

type AuthStatus = "signed_out" | "signing_in" | "signed_in" | "error"

type AuthState = {
  status: AuthStatus
  callbackUrl?: string
  params?: Record<string, string>
  error?: string
}

type AuthContextValue = AuthState & {
  startAuth: () => Promise<void>
  signOut: () => void
  token?: string | null
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function loadStoredAuth(): AuthState {
  return { status: "signed_out" }
}

function storeAuth(state: AuthState) {
  if (state.status === "signed_in") {
    void setStoredToken(state.params?.token ?? null)
    return
  }
  if (state.status === "signed_out") {
    void setStoredToken(null)
  }
}

function buildAuthUrl(redirectUrl: string) {
  const baseUrl = import.meta.env.VITE_AUTH_URL as string
  if (!baseUrl) {
    throw new Error("VITE_AUTH_URL is not set")
  }

  const redirectParam =
    (import.meta.env.VITE_AUTH_REDIRECT_PARAM as string) || "redirect_url"

  const url = new URL(baseUrl)
  if (redirectParam) {
    url.searchParams.set(redirectParam, redirectUrl)
  }
  return url.toString()
}

function isValidCallbackUrl(url: URL, port: number) {
  return (
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.port === String(port) &&
    url.pathname === "/callback"
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(loadStoredAuth)
  const portRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const setup = async () => {
      const unlistenUrl = await onUrl((url) => {
        if (!portRef.current) return
        const parsed = new URL(url)

        if (!isValidCallbackUrl(parsed, portRef.current)) {
          setState({
            status: "error",
            error: "Invalid callback URL received",
          })
          return
        }

        const params: Record<string, string> = {}
        parsed.searchParams.forEach((value, key) => {
          params[key] = value
        })

        const token = params.token || params.session || params.jwt || ""
        if (!token) {
          setState({
            status: "error",
            error: "Missing token in callback URL",
          })
          return
        }

        const nextState: AuthState = {
          status: "signed_in",
          callbackUrl: parsed.toString(),
          params: { token },
        }

        setState(nextState)
        storeAuth(nextState)

        cancel(portRef.current)
        portRef.current = null
      })

      const unlistenInvalid = await onInvalidUrl((url) => {
        setState({ status: "error", error: `Invalid callback: ${url}` })
      })

      return () => {
        unlistenUrl()
        unlistenInvalid()
      }
    }

    const teardownPromise = setup()
    return () => {
      teardownPromise.then((teardown) => teardown?.())
    }
  }, [])

  React.useEffect(() => {
    const load = async () => {
      const token = await getStoredToken()
      if (token) {
        setState({ status: "signed_in", params: { token } })
      }
    }
    void load()
  }, [])

  const startAuth = React.useCallback(async () => {
    try {
      const port = await start()
      portRef.current = port
      setState({ status: "signing_in" })

      const redirectUrl = `http://127.0.0.1:${port}/callback`
      const authUrl = buildAuthUrl(redirectUrl)

      await open(authUrl)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Failed to start auth: ${String(error)}`
      setState({
        status: "error",
        error: errorMessage,
      })
    }
  }, [])

  const signOut = React.useCallback(() => {
    const nextState: AuthState = { status: "signed_out" }
    setState(nextState)
    storeAuth(nextState)
  }, [])

  const value: AuthContextValue = {
    ...state,
    startAuth,
    signOut,
    token: state.params?.token ?? null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
