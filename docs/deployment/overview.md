# Deployment Overview

SabaiPics runs on Cloudflare's edge infrastructure with Neon PostgreSQL as the database.

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                   Cloudflare Edge                        │
                    │                                                          │
   Photographers    │   ┌─────────────┐      ┌─────────────────────────────┐  │
   ─────────────────┼──►│  Dashboard  │      │         API Worker          │  │
   app.sabaipics.com│   │   (Pages)   │─────►│   api.sabaipics.com         │  │
                    │   └─────────────┘      │                             │  │
                    │                        │  ┌───────┐ ┌─────────────┐  │  │
   Participants     │   ┌─────────────┐      │  │Queues │ │ Durable Obj │  │  │
   ─────────────────┼──►│    Event    │─────►│  └───────┘ └─────────────┘  │  │
 event.sabaipics.com│   │   (Pages)   │      │                             │  │
                    │   └─────────────┘      └──────────────┬──────────────┘  │
                    │                                       │                  │
                    │   ┌─────────────┐                     │                  │
                    │   │  R2 Bucket  │◄────────────────────┘                  │
                    │   │   (Photos)  │                                        │
                    │   └─────────────┘                                        │
                    └───────────────────────────────────────┬──────────────────┘
                                                            │
                                          ┌─────────────────┼─────────────────┐
                                          │                 ▼                 │
                                          │  ┌─────────────────────────────┐  │
                                          │  │    Neon PostgreSQL          │  │
                                          │  │    (Serverless Postgres)    │  │
                                          │  └─────────────────────────────┘  │
                                          │                                   │
                                          │  ┌─────────────────────────────┐  │
                                          │  │    AWS Rekognition          │  │
                                          │  │    (Face Recognition)       │  │
                                          │  └─────────────────────────────┘  │
                                          │                                   │
                                          │  ┌─────────────────────────────┐  │
                                          │  │    Stripe                   │  │
                                          │  │    (Payments)               │  │
                                          │  └─────────────────────────────┘  │
                                          │                                   │
                                          │  ┌─────────────────────────────┐  │
                                          │  │    Clerk                    │  │
                                          │  │    (Authentication)         │  │
                                          │  └─────────────────────────────┘  │
                                          └───────────────────────────────────┘
```

## Components

| Component            | Technology               | Purpose                                 |
| -------------------- | ------------------------ | --------------------------------------- |
| **API**              | Cloudflare Workers       | Backend API, queue consumers, cron jobs |
| **Dashboard**        | Cloudflare Pages (React) | Photographer web app                    |
| **Event**            | Cloudflare Pages (React) | Participant photo viewing               |
| **Photos**           | Cloudflare R2            | Photo storage with CDN                  |
| **Database**         | Neon PostgreSQL          | Relational data store                   |
| **Auth**             | Clerk                    | User authentication                     |
| **Payments**         | Stripe                   | Credit purchases                        |
| **Face Recognition** | AWS Rekognition          | Photo-to-face matching                  |
| **FTP Server**       | DigitalOcean (Docker)    | Camera uploads via FTPS                 |

## Environments

| Environment     | Purpose                | Deploy Trigger           |
| --------------- | ---------------------- | ------------------------ |
| **Development** | Local development      | `pnpm dev`               |
| **Staging**     | Pre-production testing | Auto on push to `master` |
| **Production**  | Live environment       | Manual workflow dispatch |

## Domains

| Environment | API                       | Dashboard                 | Event                       | Photos                       | FTP                          |
| ----------- | ------------------------- | ------------------------- | --------------------------- | ---------------------------- | ---------------------------- |
| Development | localhost:8081            | localhost:5173            | localhost:5174              | devphotos.sabaipics.com      | localhost:2121 / 990         |
| Staging     | api-staging.sabaipics.com | app-staging.sabaipics.com | event-staging.sabaipics.com | photos-staging.sabaipics.com | ftp-staging.sabaipics.com    |
| Production  | api.sabaipics.com         | app.sabaipics.com         | event.sabaipics.com         | photo.sabaipics.com          | ftp.sabaipics.com            |

## Related Docs

- [CI/CD Workflows](./cicd.md) - GitHub Actions pipeline details
- [Cloudflare Resources](./cloudflare.md) - Workers, Pages, R2, Queues setup
- [Deployment Checklist](./checklist.md) - Step-by-step deployment guide
- [FTP VPS Setup](./ftp/vps_setup.md) - DigitalOcean droplet bootstrap
