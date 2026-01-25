## Fly.io Machines: Operating Model, Autostop/Autostart, and Billing

Date: 2026-01-23

### Why this note exists

We want to understand whether Fly.io Machines can feel "serverless" via autostop/autostart, and how billing works when Machines are stopped/suspended.

### Mental model (Machines)

- A "Machine" is a Firecracker microVM belonging to a Fly App, managed via `flyctl` or the Machines REST API.
- Lifecycle is roughly: `created` (provisioning) -> `started` (running) -> `stopped` (powered off) / `suspended` (snapshot paused) -> `destroyed`.
- Starting an existing stopped Machine is typically fast because the image/rootfs is already prepared; creating a brand new Machine is slower.

Reference:
- https://fly.io/docs/machines/overview/

### Autostop/autostart (Fly Proxy)

Autostop/autostart is a Fly Proxy feature that can stop/suspend Machines when idle and start them when traffic arrives.

- Configured per service in `fly.toml`.
- Key settings:
  - `auto_stop_machines = "stop" | "suspend" | "off"`
  - `auto_start_machines = true | false`
  - `min_machines_running = <n>` (only applies to the primary region)

Example:

```toml
[http_service]
  auto_stop_machines = "stop"     # or "suspend"
  auto_start_machines = true
  min_machines_running = 0
```

Important behavior:

- Fly Proxy autostop/autostart only starts/stops/suspends EXISTING Machines.
- It does NOT create/destroy Machines, so the "max scale" is capped by however many Machines you have created.
- It uses service concurrency `soft_limit` to reason about excess capacity in a region.

References:
- https://fly.io/docs/launch/autostop-autostart/
- https://fly.io/docs/reference/fly-proxy-autostop-autostart/

### Suspend vs stop

- `stop` is a normal power off (cold start next time).
- `suspend` snapshots the entire VM state (including memory) so it can resume faster (often hundreds of ms).
- Suspend has constraints (notably it is generally intended for <= 2GB memory; no swap; no GPU).

Reference:
- https://fly.io/docs/reference/suspend-resume/

### Billing / pricing (what we get charged for)

Fly charges for Machines differently depending on state.

- Started Machines (`started` state): billed per second for the selected CPU/RAM size (+ any additional RAM over the preset).
- Stopped + suspended Machines: billed for root filesystem (rootfs) storage only; no CPU/RAM charges.
  - Rootfs rate: $0.15 per GB-month (prorated while in `stopped` / `suspended`).
- Volumes are billed separately: $0.15 per GB-month provisioned, and you pay for them even when the Machine is stopped.

References:
- https://fly.io/docs/about/pricing/
- https://fly.io/docs/about/billing/

### Does this feel "serverless"?

Kind of.

- For spiky or low traffic, autostop/autostart can scale down to 0 running Machines, meaning you stop paying CPU/RAM for idle time.
- You still pay "storage floor" costs (rootfs + any volumes), plus networking/IP/cert charges if applicable.
- Not identical to Cloud Run/Lambda because:
  - Machines are long-lived resources you create and manage.
  - Fly Proxy autostop/autostart does not create new Machines, so true scale-out requires pre-creating Machines (or separate autoscaling mechanisms).
