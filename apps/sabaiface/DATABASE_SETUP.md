# SabaiFace Internal Database Setup

## Overview

SabaiFace now has its own **internal PostgreSQL database** for storing face descriptors and metadata. This is completely separate from the main application database.

## Why a Separate Database?

1. **Isolation**: Face recognition data (vectors, descriptors) is separated from application data
2. **Performance**: Vector operations don't impact main application queries
3. **Scalability**: Can scale the face recognition database independently
4. **Security**: Sensitive biometric data is isolated from the main app

## Database Schema

### `faces` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `event_id` | text | Event/collection ID for grouping |
| `photo_id` | text | Reference to main app photo ID |
| `provider` | text | 'sabaiface' or 'aws' |
| `confidence` | text | Face detection confidence (0-1) |
| `descriptor` | vector(128) | Face embedding for similarity search |
| `bounding_box` | text | JSON: face location in image |
| `indexed_at` | timestamptz | When the face was indexed |

### Indexes

- **Event index**: Fast collection-based queries
- **Provider index**: Filter by detection provider
- **HNSW index**: Fast vector similarity search using cosine distance

## Setup Instructions

### 1. Create the Database

```bash
# Using PostgreSQL directly
createdb sabaiface

# Or using Docker
docker run --name sabaiface-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sabaiface \
  -p 5432:5432 \
  -d postgres:16
```

### 2. Enable pgvector Extension

```sql
-- Connect to the database
psql -U postgres -d sabaiface

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure Environment Variables

Edit `.dev.vars`:

```bash
# Internal database for SabaiFace
SABAIFACE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sabaiface
```

### 4. Run Migrations

```bash
# Generate migration from schema
pnpm db:generate

# Push schema to database (development)
pnpm db:push

# Or run migrations (production)
pnpm db:migrate
```

### 5. Verify Setup

```bash
# Start the server
pnpm dev

# Check logs for successful database connection
```

## Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Push schema directly (dev only - no migration file)
pnpm db:push

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

## Production Deployment

### Using Neon (Serverless Postgres)

1. Create a project at [Neon](https://neon.tech)
2. Create a database named `sabaiface`
3. Enable pgvector extension in Neon console
4. Copy connection string
5. Set `SABAIFACE_DATABASE_URL` in production environment

### Using Supabase

1. Create a project at [Supabase](https://supabase.com)
2. Enable pgvector in SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Set `SABAIFACE_DATABASE_URL` in production environment

### Using Managed PostgreSQL

1. Provision PostgreSQL 14+ database
2. Enable pgvector extension
3. Run migrations
4. Configure environment variable

## File Structure

```
apps/sabaiface/
├── src/db/
│   ├── client.ts       # Database client factory
│   ├── index.ts        # Public exports
│   └── schema/
│       ├── common.ts   # Shared column types
│       ├── faces.ts    # Faces table definition
│       └── index.ts    # Schema exports
├── drizzle.config.ts   # Drizzle Kit configuration
└── drizzle/            # Generated migrations (gitignored)
```

## Key Differences from Main Database

| Aspect | Main App DB | SabaiFace Internal DB |
|--------|-------------|----------------------|
| Purpose | Application data | Face vectors & metadata |
| Tables | Events, photos, users, etc. | Faces (with vectors) |
| Extension | Standard | pgvector |
| Connection | Neon HTTP (Workers) | postgres-js (Node.js) |
| Driver | @neondatabase/serverless | postgres |

## Troubleshooting

### "relation \"faces\" does not exist"

Run migrations:
```bash
pnpm db:push
```

### "extension \"vector\" does not exist"

Enable pgvector:
```sql
CREATE EXTENSION vector;
```

### Connection refused

Ensure PostgreSQL is running and accessible:
```bash
# Check if PostgreSQL is running
psql -U postgres -d sabaiface -c "SELECT 1"

# Check Docker container
docker ps | grep sabaiface-db
```

### Vector operations failing

Verify pgvector is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## Schema Changes

To modify the schema:

1. Edit `src/db/schema/faces.ts`
2. Generate migration: `pnpm db:generate`
3. Review generated SQL in `drizzle/`
4. Apply migration: `pnpm db:migrate`

## Performance Notes

- **HNSW Index**: Provides fast approximate nearest neighbor search
- **Cosine Distance**: Used for similarity (0 = identical, 2 = opposite)
- **Vector Dimension**: 128-D (from face-api.js descriptor)
- **Connection Pool**: 10 max connections (configurable in client.ts)

## Security Considerations

- Never commit `.dev.vars` or production database URLs
- Use separate database credentials for SabaiFace
- Rotate credentials regularly in production
- Consider using connection pooling (PgBouncer) for high traffic
