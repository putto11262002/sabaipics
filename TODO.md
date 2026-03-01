# TODO

## v2 Face Recognition — Remaining Work

**Modal endpoint:** `https://putto11262002--framefast-recognition-serve.modal.run`

### Done
- [x] Modal deployment with T4 GPU + CUDA (`modal_app.py`)
- [x] Eval: Modal matches AWS Rekognition accuracy (~73% Precision@10, 98% Rank-5)
- [x] `RECOGNITION_ENDPOINT` as wrangler var (dev=localhost:8082, staging/prod=Modal)
- [x] `pnpm dev:recognition` / `pnpm deploy:recognition` scripts
- [x] Face-eval modal provider

### 1. DB Migration
- [ ] `pnpm db:generate` — create migration for `face_embeddings` table
- [ ] Hand-edit migration SQL:
  - `CREATE EXTENSION IF NOT EXISTS vector;` at top
  - HNSW index: `CREATE INDEX face_embeddings_embedding_hnsw_idx ON face_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128);`
- [ ] Run migration against staging DB

### 2. Worker-Side: `extractFacesFromUrl`
- [ ] Add `extractFacesFromUrl(imageUrl)` to `extractor.ts`
- [ ] Update `photo-consumer.ts` to send R2 public URL instead of base64

### 3. Clean Slate
- [ ] Hard-delete all events + photos in staging DB (no users yet, no backfill)
- [ ] Drop old `faces` table (migration)
- [ ] Drop `rekognitionCollectionId` column from `events` table (migration)

### 4. Verification
- [ ] E2E: upload photo → face_embeddings row → selfie search → results
- [ ] Verify HNSW index works (cosine similarity query)

### 5. Cleanup (after verification)
- [ ] Remove `AWS_REGION` from wrangler vars
- [ ] Remove old `infra/recognition/fly.toml` and Fly.io Dockerfile
