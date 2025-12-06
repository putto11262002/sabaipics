## 0. High-level takeaways (for fast scanning)

**Good fits under current constraints (not a decision, just mapping options):**

1. **TS / Edge-first:**

   * *Hono* on **Cloudflare Workers**, using **Neon serverless driver + Drizzle** for DB.
   * Pros: very fast cold starts (isolate-based, often single-digit ms), scale-to-zero, HTTP/WebSocket Neon drivers designed for serverless.([The Cloudflare Blog][1])

2. **TS / AWS Lambda-first (classic serverless):**

   * *Fastify* or *NestJS* running on **Lambda + API Gateway** via **SST or Serverless Framework**.
   * Pros: mature ecosystem, first-class TypeScript, structured app model (Nest) or lightweight (Fastify), very low idle cost.([fastify.io][2])

3. **TS / Type-safe full-stack:**

   * *tRPC* backend (Fastify/Hono/Next.js route handlers) + React/Next frontends.
   * Pros: end-to-end type safety without schema/codegen, WebSocket support through Fastify adapter if needed.([trpc.io][3])

4. **Go / Lambda or Cloud Run:**

   * *Go Fiber* or *Gin* powered API, running on **AWS Lambda** (via Go API proxy/SAM) or **Cloud Run** containers.
   * Pros: high performance, good WebSocket support in Fiber, well-known patterns for serverless deployment.([GoFiber][4])

Below is the structured research you asked for.

---

## 1. Solutions Found (snapshot)

| Solution                                 | Category                  | Notes                                                                                                                                                                         |
| ---------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hono**                                 | Node.js / TS framework    | Edge/serverless-first TS web framework, multi-runtime (Cloudflare, Vercel, Deno, Bun, AWS, Node), very small footprint, WebSocket helper for several runtimes.([hono.dev][5]) |
| **Fastify + @fastify/aws-lambda**        | Node.js / TS + Serverless | High-performance HTTP framework with official Lambda adapter; plugin ecosystem includes WebSocket and serverless support.([fastify.io][2])                                    |
| **NestJS**                               | Node.js / TS framework    | Opinionated TS framework with DI, modules; first-class WebSocket “gateways”; can be deployed via Serverless Framework or similar to Lambda.([docs.nestjs.com][6])             |
| **tRPC (with Fastify/Hono/Next)**        | Node.js / TS framework    | End-to-end type-safe RPC layer for TS + React; adapters for Fastify (incl. WebSockets) and others.([trpc.io][3])                                                              |
| **Go Fiber**                             | Go framework              | High-performance Express-style Go framework, WebSocket contrib + recipes, examples for AWS SAM/serverless deployment.([GoFiber][4])                                           |
| **Gin**                                  | Go framework              | Very popular Go HTTP router; official AWS samples show running Gin apps as Lambda via Go API Proxy + API Gateway.([GitHub][7])                                                |
| **SST**                                  | Serverless framework      | TS-based AWS framework with “Live Lambda Development” for fast feedback, built around Lambda/APIGW.([SST Guide][8])                                                           |
| **Serverless Framework**                 | Serverless framework      | Mature, multi-provider IaC for Lambda etc., includes Node+TS REST API templates and integrated TS bundling.([serverless.com][9])                                              |
| **AWS Lambda + API Gateway**             | Deployment platform       | Event-driven serverless (scale-to-zero) runtime for Node & Go, commonly used with Fastify/Gin/Nest etc.([blog.omeir.dev][10])                                                 |
| **Cloudflare Workers**                   | Deployment platform       | Edge serverless using V8 isolates (near-zero cold starts), supports WebSockets directly and integrates with Neon via Hyperdrive.([Cloudflare Docs][11])                       |
| **Google Cloud Run**                     | Deployment platform       | Fully managed containers for any language; autoscaling including from 0 to N based on requests.([Google Cloud][12])                                                           |
| **Fly.io Machines**                      | Deployment platform       | Runs containers/VMs with autoscaling; built-in autostop/autostart + demo patterns for scaling to zero.([fly.io][13])                                                          |
| **Neon serverless driver + Drizzle ORM** | DB integration            | HTTP/WebSocket Postgres driver optimized for serverless/edge; Drizzle has Neon adapters (neon-http/neon-websockets).([GitHub][14])                                            |

---

## 2. Node.js / TypeScript frameworks

### 2.1 Hono

**Capabilities**

* Designed as a small, ultrafast web framework with “multi-runtime” support (Cloudflare Workers, Fastly, Deno, Bun, Vercel, AWS Lambda, Node).([hono.dev][5])
* Has a WebSocket Helper library for server-side WebSockets (currently Workers/Pages, Deno, Bun adapters).([hono.dev][15])
* Works well in edge/serverless environments with fetch-style APIs; request/response model is very close to Web Platform standards.([hono.dev][5])

**Developer Experience**

* First-class TypeScript support and “clean API” are explicitly advertised goals.([hono.dev][5])
* API surface is relatively small versus NestJS; learning curve is similar to Express/Fastify.
* Ecosystem is smaller than Express/Nest but growing; there are examples for WebSockets, Bun, Workers, etc.([hono.dev][16])

**Operational**

* Ideal pairing with **Cloudflare Workers** or similar isolate-based runtimes: extremely low cold starts and scale-to-zero behavior by design.([The Cloudflare Blog][1])
* For Neon: can use **Neon serverless HTTP/WebSocket driver** (via Drizzle or directly) to avoid TCP limits in serverless/edge.([Neon][17])

---

### 2.2 Fastify (+ @fastify/aws-lambda, @fastify/websocket)

**Capabilities**

* Fastify is a high-performance Node.js web framework with low overhead and plugin architecture.([fastify.io][2])
* Official `@fastify/aws-lambda` plugin allows running Fastify apps on AWS Lambda + API Gateway for serverless REST APIs.([fastify.io][18])
* WebSocket support is provided via `@fastify/websocket` or similar plugins, adding bidirectional real-time routes.([npm][19])

**Developer Experience**

* Good TypeScript support via core typings; used widely in TS backends.([fastify.io][2])
* Works well as a backend for tRPC using the Fastify adapter (HTTP + WebSockets).([trpc.io][20])
* Documentation and ecosystem are mature (plugins for auth, caching, etc.).([fastify.io][2])

**Operational**

* Lambda integration via `@fastify/aws-lambda` is established and documented.([fastify.io][18])
* For Neon: can switch from `pg` to `@neondatabase/serverless` transparently, since Neon’s driver is a drop-in replacement and optimized for serverless/edge (HTTP/WebSockets instead of TCP).([GitHub][14])

---

### 2.3 NestJS

**Capabilities**

* NestJS is a TS-native application framework combining OOP/FP/FP concepts on top of Node, often using Fastify or Express under the hood.([docs.nestjs.com][6])
* Provides a WebSocket “gateway” abstraction (`@WebSocketGateway`) with built-in adapters for Socket.io and `ws`, and supports custom adapters.([docs.nestjs.com][21])
* Supports serverless deployment, including Lambda; the official FAQ includes serverless guidance, and community tutorials exist for deploying Nest APIs via Serverless Framework.([docs.nestjs.com][6])

**Developer Experience**

* Strong DI, modules, decorators – “Angular-style backend”; type safety is very good across controllers/services/DTOs.([docs.nestjs.com][6])
* Higher learning curve than Hono/Fastify, but yields structured codebases; documentation is extensive.([docs.nestjs.com][22])

**Operational**

* Can use Express or Fastify adapters; the Fastify adapter is often used for better performance and lower overhead.([docs.nestjs.com][6])
* Lambda deployment typically uses webpack/esbuild bundling to reduce cold start times; Nest docs discuss bundling effects on cold start.([docs.nestjs.com][6])
* For Neon: again, can use `@neondatabase/serverless` and Drizzle in the data layer with Nest modules.([GitHub][14])

---

### 2.4 tRPC (with Fastify / Hono / Next.js)

**Capabilities**

* tRPC is a TS-first framework for building “end-to-end type-safe APIs” – types are inferred from router definitions, shared between client and server.([trpc.io][3])
* Supports WebSockets for subscriptions via the Fastify adapter + `@fastify/websocket`.([trpc.io][20])

**Developer Experience**

* Eliminates schema/codegen layer for TS clients; the React client consumes only type declarations, not server code, keeping strong type safety.([GitHub][23])
* Integrates directly with React/Next; this is aligned with your React/Next frontend stack.([trpc.io][24])

**Operational**

* Deployment is mostly a function of the underlying adapter (Fastify, Hono, Next).
* On Lambda: use Fastify adapter + `@fastify/aws-lambda`. On Workers: Hono adapter (community) or custom handlers.([trpc.io][20])

---

## 3. Go frameworks

### 3.1 Go Fiber

**Capabilities**

* Fiber is an Express-inspired Go web framework built on top of Fasthttp, targeting performance.([GoFiber][4])
* Provides a `websocket` contrib package with examples and recipes for WebSocket servers.([Fiber][25])

**Developer Experience**

* API is intentionally similar to Express, so JS developers can transfer routing intuition.([GoFiber][4])
* Type safety is via Go’s static typing; no direct shared types with TS frontends, but OpenAPI generation/codegen can be added separately.

**Operational**

* Fiber has recipes for AWS SAM and Lambda deployment; Lambda Go runtime requires a flat folder executable, which SAM packages and deploys.([Fiber][26])
* Community examples show Fiber + Lambda using serverless frameworks.([GitHub][27])

---

### 3.2 Gin

**Capabilities**

* Gin is a widely used Go HTTP web framework, often used for REST APIs.([sennalabs.com][28])
* AWS’s Go API Proxy supports Gin, letting existing Gin apps run on Lambda behind API Gateway.([GitHub][7])

**Developer Experience**

* Mature documentation, many examples; similar DX pattern to Fiber but with a different middleware style.

**Operational**

* Lambda + API Gateway is a common pattern: Go binary, Go API Proxy, and mapping via APIGW.([GitHub][7])
* For long-lived WebSockets, you’d more often run this on Cloud Run or a container platform rather than Lambda (Lambda WebSockets via API Gateway exists but is more involved).

---

### 3.3 Chi (not deeply researched, but relevant)

* Chi is a lightweight Go router; often used with net/http. It can be made to work on Lambda or Cloud Run similarly to Gin.
* Main value is minimalism; type safety is again via Go, and type-shared contracts would require OpenAPI/Protobuf/ConnectRPC etc.

---

## 4. Serverless-specific frameworks

### 4.1 SST (Serverless Stack)

**Capabilities**

* SST is a TypeScript “Infrastructure with Code” framework primarily targeting AWS (Lambda, API Gateway, etc.).([b-nova.com][29])
* Provides a **Live Lambda Development** feature that proxies Lambda invocations to your local machine via WebSockets, enabling very fast change/test cycles.([SST Guide][8])

**Developer Experience**

* Uses TypeScript for infra definitions and integrates well with TS codebases, which aligns with your stack.([b-nova.com][29])
* Community feedback highlights productivity gains from Live Lambda Dev for serverless DX.([Medium][30])

**Operational**

* Targets scale-to-zero Lambda workloads on AWS; all logging/monitoring uses AWS primitives plus SST dashboards.([SST Guide][8])

---

### 4.2 Serverless Framework

**Capabilities**

* IaC-style framework to define Lambda/APIGW functions across multiple cloud providers, with strong support for Node.js + TypeScript templates.([serverless.com][9])
* TypeScript builds are integrated via esbuild in v4, improving cold start by bundling code.([serverless.com][31])

**Developer Experience**

* Uses YAML for function definitions; app logic is still in TS/JS.
* Large ecosystem, many examples for REST APIs and background jobs.([serverless.com][9])

**Operational**

* Integrates out-of-the-box with AWS monitoring tools; plugin ecosystem for additional observability.

---

### 4.3 AWS SAM (brief)

* SAM is AWS’s own serverless deployment model, often used with Go and Node for Lambda, including Fiber recipes.([Fiber][26])
* More AWS-specific, less TS-pleasant than SST; strongly aligned with CloudFormation and the AWS toolchain.

---

## 5. Deployment platforms (with WebSockets & cold starts)

### 5.1 AWS Lambda + API Gateway

**Serverless & cold start**

* Classic container-based serverless: scales to zero by default (no idle cost except storage/infra).([blog.omeir.dev][10])
* Node.js and Go are among the fastest Lambda runtimes; several benchmarks and articles show Go often achieving better overall performance and sometimes better cold starts, though results vary.([awsfundamentals.com][32])

**WebSockets**

* API Gateway has a specific WebSocket API mode; Lambda functions can handle connect/message/disconnect events. (Not re-cited; AWS docs.)
* Operationally more complex: you manage routes & connection IDs yourself.

**Fit to requirements**

* Strong match for event-driven traffic and scale-to-zero.
* Cold start mitigation patterns (bundling, per-runtime tuning) are well studied.([arXiv][33])

---

### 5.2 Cloudflare Workers

**Serverless & cold start**

* Uses V8 isolates instead of containers; Cloudflare reports cold starts in single-digit milliseconds, and platform messaging emphasizes effectively eliminating cold starts on requests.([The Cloudflare Blog][1])

**WebSockets**

* Workers support WebSockets APIs (creating and accepting WebSocket connections) for real-time communication.([Cloudflare Docs][11])

**Fit**

* Very strong alignment with “fast experience” + “serverless-friendly” + “scale-to-zero”.
* Works well with Hono and Neon via Hyperdrive or Neon’s serverless/HTTP drivers.([hono.dev][34])

---

### 5.3 Vercel (for APIs and realtime)

**Serverless**

* Focused on Next.js and frontend-centric workflows; provides serverless and edge functions with autoscaling.([Northflank][35])

**WebSockets**

* Historically, Vercel serverless functions did **not** support raw WebSocket connections; documentation and community discussions still describe WebSockets as unsupported, recommending external providers (Ably, Pusher, etc.).([Vercel][36])
* Official docs list realtime providers (Ably, Pusher, Supabase Realtime, etc.) as recommended approaches for realtime over WebSockets.([Vercel][37])

**Fit**

* Works well for your **Next.js public site** and potentially a “light API,” but for native WebSocket handling inside your own backend, this tends to push you toward either:

  * An external realtime provider, or
  * A separate backend runtime (Lambda, Workers, Fly, etc.).

---

### 5.4 Google Cloud Run

**Serverless & cold start**

* Runs containers for any language; autoscaling from 0 to N instances based on HTTP requests.([Google Cloud][12])
* Instances may stay warm (idle) for up to ~15 minutes to reduce cold starts; they can be scaled down when no traffic.([Stack Overflow][38])

**WebSockets**

* WebSockets are supported because it runs a standard HTTP container; you manage the process like any Go/Node server.

**Fit**

* Good if you want container semantics (e.g., WebSocket server with long-lived connections) but still scale-to-zero on low traffic.
* Cold start is still container-style, not isolate-style; mitigations exist (min instances, etc.).

---

### 5.5 Fly.io

**Serverless & cold start**

* Fly Machines + proxy provide autostart/autostop for containers; you can autoscale based on metrics and community patterns show scale-to-zero setups.([fly.io][13])

**WebSockets**

* Because Fly exposes your container directly, WebSockets are supported like any normal TCP/HTTP app.

**Fit**

* More PaaS-like than Lambda/Workers; good if you want direct control of processes and WebSockets while still getting “almost serverless” billing via autostop.

---

## 6. WebSocket support summary (practical)

**Native or direct WebSocket hosting**

* Hono + Cloudflare Workers: direct WebSocket support with helper library (Workers/Pages/Bun/Deno).([hono.dev][15])
* Fastify: WebSockets via `@fastify/websocket`, works on Node servers and can be adapted to Lambda or container platforms.([npm][19])
* NestJS: WebSocket gateways built-in, with adapters for ws/Socket.io; underlying transport must support long-lived connections (container, EC2, Cloud Run, Workers equivalent).([docs.nestjs.com][21])
* Go Fiber / Gin: can host WebSockets when running as a long-lived server (Cloud Run, Fly, EC2, etc.).([Fiber][25])

**Serverless with more friction**

* AWS Lambda + API Gateway WebSocket APIs: supported but more complex (connection IDs, state management).
* Vercel: still lacks direct WebSocket server support; recommended to use managed realtime providers (Ably, Pusher, etc.).([Vercel][36])

---

## 7. Type safety & React integration

**TypeScript-native backends**

* Hono, Fastify, NestJS all emphasize TS support; Hono and Fastify keep the API surface small, NestJS is heavily decorator-driven.([hono.dev][5])

**End-to-end type safety patterns**

* **tRPC**: type signatures inferred from server router; React client uses those types directly, with optional WebSocket transport for subscriptions.([trpc.io][3])
* **OpenAPI + codegen**: for Go or any REST API, you can generate TS types for React; many tools exist, though not researched in detail here.

**Database layer**

* **Drizzle ORM + Neon**: Drizzle offers Neon-specific adapters (`neon-http`, `neon-websockets`) built on Neon’s serverless driver, giving typed queries and serverless-friendly connection behavior.([orm.drizzle.team][39])

---

## 8. Integration considerations (by subsystem)

### 8.1 Neon (Postgres, serverless)

* Neon uses PgBouncer for connection pooling on their side, enabling up to ~10k concurrent connections; serverless drivers avoid TCP connection storms.([Neon][40])
* Neon’s serverless driver for JS/TS is explicitly “ideal for serverless/edge” and uses HTTP or WebSockets instead of TCP, designed to be a drop-in replacement for `pg`.([GitHub][14])
* Drizzle integrates directly with Neon via `neon-http`/`neon-websockets`, matching serverless patterns.([orm.drizzle.team][39])

**Implication:** any TS backend that can use this driver (Hono/Fastify/Nest on Lambda or Workers) will satisfy “serverless-friendly + connection pooling” requirements with minimal extra infra.

---

### 8.2 Object storage (presigned URLs)

* All listed platforms (Lambda, Workers, Cloud Run, Fly, Vercel via APIs) can generate presigned URLs for S3-compatible or vendor object stores; SDK choice is platform-specific.
* Cloudflare Workers pair naturally with Cloudflare R2, Lambda with S3, etc.; presigned URL generation is common in each SDK.

---

### 8.3 Image subsystem (notifications when done)

* WebSockets (where supported) can be used directly from backend to frontend for “photo processed” events.
* Alternate pattern: message queue (SNS/SQS/PubSub/Queues) + HTTP callback to backend, which then pushes via WebSocket or uses managed realtime provider (Ably/Pusher/Supabase) – especially relevant if backend is on Vercel or other WebSocket-limited runtime.([Vercel][41])

---

### 8.4 Frontend (React + Next.js)

* tRPC + Fastify/Hono/Next route handlers is a strong way to get type-safe APIs and React hooks clients.([trpc.io][24])
* For server-sent events or streaming (if you move away from raw WebSockets), both Workers and modern Node runtimes support Web Streams; Vercel documents streaming as a primary pattern.([Vercel Community][42])

---

### 8.5 LINE LIFF & webhooks

* All platforms that can expose HTTPS endpoints (Lambda/APIGW, Workers, Cloud Run, Fly, Vercel functions) can handle LINE OAuth redirect URIs and webhook endpoints.
* For Workers/Hono or Fastify on Lambda, OAuth flows are standard REST endpoints; nothing framework-specific is required.

---

### 8.6 Desktop app (Wails)

* Wails desktop client will call the same HTTP/WebSocket APIs as the web frontend; any framework that offers clean REST/RPC endpoints and token-based auth will work.
* Real-time status for photo processing can be handled similarly to web: WebSockets where the backend supports them directly, or via a managed realtime channel.

---

## 9. Open questions (to refine later)

These are not decisions, just questions that significantly affect narrowing the options:

1. **Primary cloud:** Is there a strong preference or existing footprint on AWS vs Cloudflare vs GCP vs “agnostic PaaS” (Fly/Render/Railway)?
2. **Realtime strategy:** Self-host WebSockets (Workers, Cloud Run, Fly, Lambda WebSocket APIs) vs using a managed service (Ably/Pusher/Supabase Realtime) especially if API lives on Vercel.([Vercel][41])
3. **Language alignment:** Is there willingness to run both TS and Go backends, or is consolidating on TS (with tRPC + Drizzle + Neon) a priority?
4. **Operational tolerance:** How much appetite is there for AWS-specific constructs (API Gateway WebSockets, SAM/SST) versus simpler edge deployments (Workers + Hono)?
5. **Latency needs:** Are there hard latency targets where Cloudflare’s edge runtimes (near-zero cold start) offer a clear advantage over Lambda/Cloud Run?([The Cloudflare Blog][1])


[1]: https://blog.cloudflare.com/eliminating-cold-starts-with-cloudflare-workers/?utm_source=chatgpt.com "Eliminating cold starts with Cloudflare Workers"
[2]: https://fastify.io/?utm_source=chatgpt.com "Fastify: Fast and low overhead web framework, for Node.js"
[3]: https://trpc.io/?utm_source=chatgpt.com "tRPC - Move Fast and Break Nothing. End-to-end typesafe ..."
[4]: https://gofiber.io/?utm_source=chatgpt.com "Go Fiber"
[5]: https://hono.dev/?utm_source=chatgpt.com "Hono - Web framework built on Web Standards"
[6]: https://docs.nestjs.com/faq/serverless?utm_source=chatgpt.com "Serverless - FAQ | NestJS - A progressive Node.js framework"
[7]: https://github.com/build-on-aws/golang-gin-app-on-aws-lambda?utm_source=chatgpt.com "build-on-aws/golang-gin-app-on-aws-lambda"
[8]: https://guide.sst.dev/examples/how-to-create-a-rest-api-in-typescript-with-serverless.html?utm_source=chatgpt.com "How to create a REST API in TypeScript with serverless"
[9]: https://www.serverless.com/examples/aws-node-rest-api-typescript-simple?utm_source=chatgpt.com "aws-node-rest-api-typescript example"
[10]: https://blog.omeir.dev/building-a-serverless-rest-api-with-go-aws-lambda-and-api-gateway?utm_source=chatgpt.com "Building a Serverless REST API with Go, AWS Lambda, and ..."
[11]: https://developers.cloudflare.com/workers/examples/websockets/?utm_source=chatgpt.com "Using the WebSockets API · Cloudflare Workers docs"
[12]: https://cloud.google.com/run?utm_source=chatgpt.com "Cloud Run"
[13]: https://fly.io/autoscaling?utm_source=chatgpt.com "Autoscaling · Fly"
[14]: https://github.com/neondatabase/serverless?utm_source=chatgpt.com "neondatabase/serverless: Connect to Neon PostgreSQL ..."
[15]: https://hono.dev/docs/helpers/websocket?utm_source=chatgpt.com "WebSocket Helper"
[16]: https://hono.dev/docs/getting-started/bun?utm_source=chatgpt.com "Bun"
[17]: https://neon.com/docs/serverless/serverless-driver?utm_source=chatgpt.com "Neon serverless driver - Neon Docs"
[18]: https://fastify.io/docs/latest/Guides/Serverless/?utm_source=chatgpt.com "Serverless"
[19]: https://www.npmjs.com/package/%40fastify/websocket?utm_source=chatgpt.com "fastify/websocket"
[20]: https://trpc.io/docs/server/adapters/fastify?utm_source=chatgpt.com "Fastify Adapter"
[21]: https://docs.nestjs.com/websockets/gateways?utm_source=chatgpt.com "Gateways | NestJS - A progressive Node.js framework"
[22]: https://docs.nestjs.com/deployment?utm_source=chatgpt.com "Deployment | NestJS - A progressive Node.js framework"
[23]: https://github.com/trpc/trpc?utm_source=chatgpt.com "trpc/trpc: 🧙‍♀️ Move Fast and Break Nothing. End-to- ..."
[24]: https://trpc.io/docs/quickstart?utm_source=chatgpt.com "Quickstart"
[25]: https://docs.gofiber.io/contrib/websocket/?utm_source=chatgpt.com "Websocket"
[26]: https://docs.gofiber.io/recipes/aws-sam/?utm_source=chatgpt.com "AWS SAM"
[27]: https://github.com/deepakgonda/go-serverless-fiber-app-sample?utm_source=chatgpt.com "Go Fiber App using serverless for AWS Lambda"
[28]: https://sennalabs.com/blog/rest-apis-on-awslambda-with-go?utm_source=chatgpt.com "ทำ REST APIs บน AWS Lambda ด้วย Go"
[29]: https://b-nova.com/en/home/content/sst-theory-architecture-deep-dive/?utm_source=chatgpt.com "SST - Theory, Architecture & Deep Dive - b-nova"
[30]: https://medium.com/nerd-for-tech/shifting-gears-a-journey-from-serverless-framework-to-sst-3f8c91b20ca8?utm_source=chatgpt.com "Shifting Gears: A Journey from Serverless Framework to SST"
[31]: https://www.serverless.com/framework/docs/providers/aws/guide/building?utm_source=chatgpt.com "Function Build Configuration"
[32]: https://awsfundamentals.com/blog/supported-languages-at-aws-lambda?utm_source=chatgpt.com "Supported Languages at AWS Lambda"
[33]: https://arxiv.org/html/2310.08437v2?utm_source=chatgpt.com "Cold Start Latency in Serverless Computing: A Systematic ..."
[34]: https://hono.dev/docs/getting-started/cloudflare-workers?utm_source=chatgpt.com "Cloudflare Workers"
[35]: https://northflank.com/blog/vercel-backend-limitations?utm_source=chatgpt.com "Can you use Vercel for backend? What works and when to ..."
[36]: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections?utm_source=chatgpt.com "Do Vercel Serverless Functions support WebSocket ..."
[37]: https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel?utm_source=chatgpt.com "Publish and Subscribe to Realtime Data on Vercel"
[38]: https://stackoverflow.com/questions/68247889/how-does-cloud-run-scaling-down-to-zero-affect-long-computation-jobs-or-external?utm_source=chatgpt.com "How does Cloud Run scaling down to zero affect long ..."
[39]: https://orm.drizzle.team/docs/connect-neon?utm_source=chatgpt.com "Drizzle ORM - Neon"
[40]: https://neon.com/docs/connect/connection-pooling?utm_source=chatgpt.com "Connection pooling - Neon Docs"
[41]: https://vercel.com/kb/guide/deploying-pusher-channels-with-vercel?utm_source=chatgpt.com "Deploying Real-Time Apps with Pusher Channels and Vercel"
[42]: https://community.vercel.com/t/does-vercel-support-websockets-now-that-we-have-fluid-compute/27205?utm_source=chatgpt.com "Does vercel support websockets now that we have fluid ..."
