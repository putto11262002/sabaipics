import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  CORS_ORIGIN: string
}

const app = new Hono<{ Bindings: Bindings }>()
  .use('/*', (c, next) => {
    return cors({
      origin: c.env.CORS_ORIGIN,
      credentials: true,
    })(c, next)
  })
  .get('/', (c) => {
    return c.text('Hello Hono!')
  })
  .get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() })
  })

// Export type for Hono RPC client
export type AppType = typeof app

export default app
