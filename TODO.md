# TODO

## v2 Face Recognition — Remaining Work

Code changes are done (staged, not yet committed). Python service deployed to Modal.

**Modal endpoint:** `https://putto11262002--framefast-recognition-serve.modal.run`

### 1. DB Migration
- [ ] Run `drizzle-kit generate` to create migration SQL for `face_embeddings` table
- [ ] Hand-edit the generated migration to add:
  - `CREATE EXTENSION IF NOT EXISTS vector;` at the top
  - HNSW index: `CREATE INDEX face_embeddings_embedding_hnsw_idx ON face_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
- [ ] Run migration against staging DB

### 2. Worker-Side Updates
- [ ] Update `extractor.ts` — add `extractFacesFromUrl(imageUrl)` method
- [ ] Update `photo-consumer.ts` — use `extractFacesFromUrl` with R2 public URL instead of base64
- [ ] Set `RECOGNITION_ENDPOINT` env var to Modal URL in `.dev.vars` and wrangler secrets

### 3. Verification
- [x] Integration test: call `POST /extract` against Modal, verify response format
- [ ] DB: run migration, insert test embedding, verify HNSW index works
- [ ] E2E: upload photo → verify `face_embeddings` row → selfie search → results
- [ ] Re-run `face-eval` suite against new `/extract` endpoint

### 4. Post-Migration Cleanup (later)
- [ ] Backfill existing photos (re-index through queue)
- [ ] Drop old `faces` table (migration)
- [ ] Drop `rekognitionCollectionId` column from `events` table (migration)
- [ ] Remove `AWS_REGION` from wrangler vars
- [ ] Remove old `infra/recognition/fly.toml` and Fly.io Dockerfile
