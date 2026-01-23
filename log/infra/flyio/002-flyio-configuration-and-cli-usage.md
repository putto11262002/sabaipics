## Fly.io: fly.toml configuration and flyctl CLI usage

Date: 2026-01-23

### Why this note exists

We want to understand how to write `fly.toml` config files and use the `flyctl` CLI for deploying, configuring, and managing Fly.io apps and Machines.

### fly.toml: app configuration reference

`fly.toml` is the primary app config file. It lives in your project root and is read by `flyctl` and `fly deploy`.

Key sections:

#### `app` section

Define app metadata:

```toml
app = "my-app-name"
primary_region = "sjc"
```

#### `build` section

Control how your app’s Docker image is built:

```toml
[build]
  builder = "dockerfile"  # or use buildpacks (not recommended)
  dockerfile = "Dockerfile"
  image = "registry.io/image:tag"  # override detection
```

- If no `[[build]]` and no `--image`/`--dockerfile`, Fly auto-detects (Dockerfile first, then buildpacks).
- Buildpacks are deprecated; prefer explicit Dockerfile or `image`.

#### `[[services]]` and `[http_service]`

Define how your app is exposed to the internet (or private network):

```toml
[[services]]
  internal_port = 8080
  protocol = "tcp"
  force_https = true

  auto_stop_machines = "stop"  # or "suspend" or "off"
  auto_start_machines = true
  min_machines_running = 0

  [[services.concurrency]]
    type = "connections"
    soft_limit = 25
    hard_limit = 50

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "5s"
```

Alternative for HTTP-only apps: `[http_service]` (simpler defaults; auto adds HTTP health checks and handles concurrency).

#### `[[vm]]` (VM size)

Define default CPU/RAM for Machines created by Fly Launch:

```toml
[[vm]]
  size = "shared-cpu-2x"   # named preset
  memory = "2gb"              # optional: override preset RAM
  cpus = 2                    # optional: override CPU count (advanced)
```

- Settings here take precedence when you run `fly deploy` or `fly scale count`.
- If no `[[vm]]`, Fly uses existing Machines to infer new size, then falls back to `shared-cpu-1x` (256MB RAM).
- For per-process-group VM sizes, add `process = "group-name"` under `[[vm]]`.

#### `[[mounts]]`

Attach volumes to Machines:

```toml
[[mounts]]
  source = "data_volume"
  destination = "/data"
```

#### `[[files]]`

Write secrets to filesystem at boot (values must be base64-encoded):

```toml
[[files]]
  guest_path = "/etc/secrets/private.key"
  secret_name = "PRIVATE_KEY_B64"
```

#### `[deploy]`

Control deployment behavior:

```toml
[deploy]
  strategy = "rolling"  # or "immediate", "canary", "bluegreen"
  release_command = "npm run migrate"
  healthcheck = { path = "/health", timeout = "2s" }
```

### flyctl: essential commands

#### Authentication

```bash
fly auth signup   # create account
fly auth login     # sign in
```

#### Launch and deploy

```bash
fly launch          # interactive: create app, generate fly.toml, deploy
fly deploy          # build and deploy using local fly.toml
fly deploy --strategy canary
fly deploy --detach   # background deploy
```

- `fly deploy` builds Docker image (or uses pre-built image), then updates Machines in place.
- It respects `fly.toml` configuration (VM size, regions, services, etc.).
- Adding a secret triggers a new deployment; `fly secrets set` alone doesn’t deploy unless you use `fly secrets deploy`.

#### Secrets

```bash
fly secrets set DATABASE_URL=postgres://user:pass@host/db
fly secrets list
fly secrets unset DATABASE_URL
fly secrets deploy       # redeploy current image with staged secrets
fly secrets set KEY=$(cat file.txt | base64)  # for [[files]] usage
```

- Secrets are encrypted at rest in Fly’s vault.
- At runtime, they are injected as environment variables into every Machine.
- Use `--stage` with `set` to defer Machine restart to next start/update.

#### Scaling: horizontal (Machine count)

```bash
fly scale show       # view current Machines, regions, VM sizes
fly scale count 4    # add Machines to default process group
fly scale count web=2 worker=1 --region nrt
fly scale count 0     # scale to zero (use `fly deploy` to bring back if no Machines exist)
fly scale count 3 --max-per-region 1  # cap per region
```

- `fly scale count` works on Fly Launch-managed Machines (the default `app` process group).
- It can scale per region, per process group, or both.
- If you scale down to zero and back up, `fly scale count` may not work (use `fly deploy`).

#### Scaling: vertical (CPU/RAM)

```bash
fly platform vm-sizes    # list named presets and pricing
fly scale vm shared-cpu-2x
fly scale vm performance-1x
fly scale memory 1gb
fly scale memory 4096   # top up RAM on existing CPU preset
```

- Settings applied via `fly scale vm`/`fly scale memory` override `fly.toml` `[[vm]]` on next deploy.
- You can also scale per process group: `fly scale vm performance-2x --process-group worker`.

#### Machine-level operations

```bash
fly machine status <machine-id>
fly machine stop <machine-id>
fly machine start <machine-id>
fly machine clone <machine-id> --region syd
fly machine destroy <machine-id> --force
```

- These are for unmanaged Machines (created via `fly machine run` or Machines API).
- Machines created by `fly deploy` are updated as a group; use `fly scale` instead.

#### Logs and monitoring

```bash
fly logs                    # tail logs (Ctrl+C to exit)
fly logs --region ord      # filter by region
fly status                  # show Machines, states, health checks
fly ping <app-name>         # HTTP ping; useful for health checks
```

### Common patterns

#### Simple web app

```toml
app = "web-app"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  auto_stop_machines = "stop"
  auto_start_machines = true
```

Deploy and run:

```bash
fly launch
# or, if you already have a fly.toml:
fly deploy
```

#### App with volumes

```toml
[[mounts]]
  source = "data_vol"
  destination = "/data"
```

Create volume:

```bash
fly volumes create data_vol --size 1gb --region sjc
```

#### Staging/production setup

Option 1: separate apps

```bash
cd prod-app
fly launch --name prod-app

cd ../staging-app
fly launch --name staging-app
```

Option 2: separate orgs (for stricter separation)

Use different Fly organizations for dev/staging/prod.

#### CI/CD with GitHub Actions

Deploy from CI:

```bash
fly deploy --remote-only
```

- `--remote-only` skips local build and lets Fly.io build from your GitHub repo.
- Works best when you’ve configured a build in Fly’s dashboard (or Dockerfile build).

### Key references

- fly.toml reference: https://fly.io/docs/reference/configuration/
- flyctl reference: https://fly.io/docs/flyctl/
- Launch app: https://fly.io/docs/getting-started/launch/
- Deploy: https://fly.io/docs/launch/deploy/
- Secrets: https://fly.io/docs/apps/secrets/
- Scale count: https://fly.io/docs/launch/scale-count/
- Scale machine: https://fly.io/docs/launch/scale-machine/
