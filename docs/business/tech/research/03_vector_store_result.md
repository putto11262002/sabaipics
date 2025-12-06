## 0. Scope + Candidate Set

Given your scale (≤1.25M vectors, 512-dim, ~2.5 GB, ≤100k searches/month) and constraints (cost, <100 ms latency, filter by `event_id`, high-velocity dev, scale-to-zero), the *practical* option set is:

**Postgres / Neon:**

1. **Neon Postgres + `pgvector`** (extension inside your existing Neon DB)

**Serverless vector services:**
2. **Upstash Vector**
3. **Cloudflare Vectorize**

**Managed vector DBs (cluster or “serverless” but with minimums):**
4. **Pinecone Serverless**
5. **Qdrant Cloud (managed)**
6. **Weaviate Cloud (serverless)**
7. **Zilliz Cloud (Milvus)** – similar profile to Weaviate/Qdrant, I’ll treat more briefly.

**Self-hosted:**
8. **Self-hosted Qdrant / Milvus / Weaviate** on your own VM/Kubernetes.

Below I focus on (1–6) in detail, and treat (7–8) as secondary.

---

## 1. “Solutions Found” Overview

| Solution                    | Category             | High-level notes (relative to your use case)                                                                                                                      |
| --------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neon + pgvector             | Postgres extension   | Runs inside your existing Neon DB; uses HNSW/IVFFlat indexes; full SQL filtering; Neon already supports `pgvector` as first-class extension. ([Neon][1])          |
| Upstash Vector              | Serverless vector DB | Pay-per-request + cheap storage; DiskANN-based ANN; explicit “price scales to zero”; built for serverless/edge. ([Upstash: Serverless Data Platform][2])          |
| Cloudflare Vectorize        | Serverless vector DB | Fully serverless; billed only on stored + queried dimensions; integrates tightly with Cloudflare Workers AI; metadata filtering supported. ([Cloudflare Docs][3]) |
| Pinecone Serverless         | Managed vector DB    | Mature, high-performance serverless vector DB; strong metadata filtering; comparatively high minimum monthly spend. ([Orb][4])                                    |
| Qdrant Cloud                | Managed & self-host  | HNSW vector DB with strong filtering; free 1GB tier then small hourly charge; no true scale-to-zero (cluster runs 24/7). ([Qdrant][5])                            |
| Weaviate Cloud (serverless) | Managed & serverless | Serverless, pay-per-dimensions stored; base monthly fee + per-dimension; multi-modal capabilities; costlier at your scale. ([Medium][6])                          |
| Zilliz Cloud (Milvus)       | Managed              | Milvus-backed; pay-as-you-go, good for very large scale; similar cost profile to Pinecone/Weaviate at small scale. ([zilliz.com][7])                              |
| Self-hosted Qdrant/Milvus   | Self-hosted          | No license fee, but 24/7 VM cost + ops overhead; good where infra already exists or strict control is needed. ([Airbyte][8])                                      |

Next: detailed cost and technical characteristics for the main six options.

---

## 2. Cost Comparison (Tier 1–3)

### 2.1 Assumptions for cost math

* Embedding size: **512 dims**.
* Storage: **2KB/embedding**, so Tier3 ≈ **2.5 GB** (your estimate).
* Monthly *new* writes ≈ “Total embeddings” in each tier (worst-case).
* 1 USD = **31.96 THB** (your assumption).
* Numbers below are approximate, based on public pricing as of late 2025; all are *order-of-magnitude* guides, not quotes.

### 2.2 Approx monthly cost per solution

**Legend:** USD (THB).
For Neon I show incremental storage cost *if* you were paying pure per-GB beyond plan allowances.

| Tier                               | Neon + pgvector (storage only*) | Upstash Vector         | Cloudflare Vectorize   | Pinecone Serverless       | Qdrant Cloud (min cluster) | Weaviate Cloud (serverless) |
| ---------------------------------- | ------------------------------- | ---------------------- | ---------------------- | ------------------------- | -------------------------- | --------------------------- |
| **T1** (15.5k embeds, 1k searches) | ~$0.01 (฿0.32) | ~$0.07 (฿2.24) | $5.00 (฿160) | $50 (฿1,598) | ~$10.1 (฿323) | ~$25.8 (฿824) |
| **T2** (157.5k, 15k)               | ~$0.05 (฿1.60) | ~$0.69 (฿22) | ~$5.04 (฿161) | $50 (฿1,598) | ~$10.1 (฿323) | ~$32.7 (฿1,045) |
| **T3** (1.25M, 100k)               | ~$0.43 (฿14) | ~$5.78 (฿185) | ~$5.33 (฿170) | $50 (฿1,598) | ~$10.5 (฿336) | ~$85.8 (฿2,743) |

**How these were derived (key points):**

* **Neon + pgvector**

  * Neon articles and docs indicate storage around **$0.17/GB-month** beyond included plan quotas. ([Medium][9])
  * At 2.5 GB, that’s ~**$0.43/month** extra if you’re already on a plan with full included storage used. In practice, Launch plan includes **10 GB** storage for $19/month, so your 2.5 GB of vectors fit inside that with no direct incremental storage fee. ([Orb][10])
  * Compute cost for 100k vector queries/month will be negligible compared to baseline app usage at this scale; Neon bills on compute hours, not per query. ([Neon][11])

* **Upstash Vector**

  * Upstash blog: **$0.40 per 100k requests** and **$0.25/GB-month storage**, first **1GB free**; free tier also includes 10k queries + 10k updates/day. ([Upstash: Serverless Data Platform][12])
  * Tier3 worst-case (1.25M writes + 100k reads in a month) ⇒ ~**1.35M requests** ≈ **$5.4** plus storage (≈2.5 GB → 1.5 GB billable → $0.38). Total ≈ **$5.78/month**.

* **Cloudflare Vectorize**

  * Pricing: first **10M stored dimensions** and **50M queried dimensions** included, then **$0.05 per 100M stored dims** and **$0.01 per 1M queried dims**. ([Cloudflare Docs][3])
  * Tier3: 1.25M vectors × 512 dims = **640M stored dims** (630M billable), 100k queries × 512 dims = **51.2M queried dims** (1.2M billable). That’s ≈ **$0.32 storage + $0.01 query**.
  * Requires Workers paid plan (~**$5/month** base). ([The Cloudflare Blog][13])
  * So roughly **$5.3/month** at Tier3.

* **Pinecone Serverless**

  * Recent pricing analyses show **Standard** serverless: storage at **$0.33/GB-month**, writes at **$4 per million units**, reads at **$16 per million**, with a **$50/month minimum** for the plan. ([MetaCTO][14])
  * Your usage is far below what the min covers; thus you effectively hit the **$50/month floor** across T1–T3.

* **Qdrant Cloud**

  * Qdrant Cloud offers a free **1GB** tier, larger clusters from around **$0.014/hour** (~$10/month) for the smallest hybrid cloud, plus storage (~$0.15/GB-month) depending on provider. ([Qdrant][5])
  * At your scale, a very small cluster suffices, so approximation: **≈$10/month + small storage** (~$0.45 at 2.5GB), so ≈ **$10.5/month** at Tier3.

* **Weaviate Cloud (serverless)**

  * Weaviate Cloud serverless: base from **$25/month**, plus **$0.095 per 1M vector dimensions stored** (non-HA, Standard SLA). ([Medium][6])
  * At Tier3: 640M dims × 0.095/1M = **$60.8** + base $25 → **$85.8/month**.

**Cost reflection:**
At your current and projected scale, **Neon+pgvector, Upstash Vector, and Cloudflare Vectorize** are in a different cost regime (≈$0–6/month incremental) than Pinecone/Weaviate/Qdrant managed (~$10–85+/month with non-zero minimums).

---

## 3. Option 1 – Neon Postgres + `pgvector` (same DB)

### 3.1 Technical characteristics

* **Embedding dimensions:** `pgvector` supports vectors up to 16k dimensions by default; your 512-dim face embeddings are well within limits. ([Neon][1])
* **Index types:**

  * **Exact** search with no index (sequential scan) – good only at very small N.
  * **IVFFlat** (inverted file index) for ANN. ([Neon][1])
  * **HNSW** (graph-based ANN) for faster, high-recall search; Neon explicitly supports HNSW via `pgvector`. ([Neon][1])
* **Distance metrics:** L2, inner product, cosine, plus others (L1, Hamming, Jaccard) as of latest docs. ([Neon][1])
* **Filtering by `event_id`:** fully supports **SQL WHERE** on any columns; you can:

  ```sql
  SELECT id, distance
  FROM faces
  WHERE event_id = $1
  ORDER BY embedding <-> $2
  LIMIT 50;
  ```
* **Query latency:**

  * TigerData benchmark (50M 768-dim embeddings) shows both Postgres+pgvector and Qdrant achieving **sub-100ms** latencies at 99% recall, with Postgres reaching ~471 QPS at that recall. ([tigerdata.com][15])
  * Separate pgvector benchmarks (1M vectors, 64 dims) show P95 latencies ~125–160 ms at 1M vectors with tuned parameters; your dataset is roughly similar scale but with 512 dims, so expect tens of milliseconds with correct HNSW/IVFFlat setup. ([Mastra][16])

Given your **≤1.25M** vectors and modest QPS, pgvector is within its “comfortable” range (issues start ~10M+ vectors or require <10ms at very high QPS). ([Medium][17])

### 3.2 Batch insert performance

* `pgvector` works with normal Postgres bulk mechanisms: `COPY`, multi-row inserts, or language-client batch inserts. ([Medium][18])
* Approx order-of-magnitude guidance from community benchmarks: build HNSW/IVFFlat index over **1M vectors** in minutes on moderate hardware; incremental inserts amortize index maintenance. ([Pinecone][19])

### 3.3 Operational characteristics (Neon)

* **Scale-to-zero:** Neon “Scale to Zero” auto-suspends compute after **5 minutes of inactivity**, then reactivates in “a few hundred milliseconds” when queried again. ([Neon][20])
* **Cold starts:** you will see one cold start when a new photo batch or user search hits after a quiet period; Neon’s own benchmarks emphasize cold starts are relatively rare across 1M+ databases and usually not dominant. ([Neon][21])
* **Complexity:** You already run Neon; adding `pgvector` is a one-line `CREATE EXTENSION vector` plus table and index DDL. ([Neon][1])

### 3.4 Architectural / integration notes

* **Neon + Face AI:**

  * Face embeddings can be generated in your API or in a separate worker and written into the same Neon DB row as other face metadata (`face_id`, `event_id`, `photo_id`, etc.).
* **Filters by `event_id` and others:**

  * Put `event_id` as normal indexed column (B-tree) and use it alongside vector index; Postgres planner will combine them.
* **Serverless backend:**

  * You already connect to Neon from your serverless API; vector queries are just SQL. You do need to be careful with connection pooling (PgBouncer style) or use HTTP connection proxies/Neon connection pooling.

**Step reflection:**
For your current scale envelope, **Neon+pgvector meets all hard requirements (cost, <100ms latency, event filter, scale-to-zero, dev velocity) based on available benchmarks and pricing**. Remaining questions are mostly about headroom (e.g. if you later go beyond ~10M vectors or need multi-region).

---

## 4. Option 2 – Upstash Vector (serverless)

### 4.1 Technical

* **Index + algorithm:** Upstash Vector uses **DiskANN/FreshDiskANN**, designed for disk-backed ANN with low latency and high recall. ([Upstash: Serverless Data Platform][22])
* **Dimensions:** free tier supports up to 1536 dims; paid tiers up to 3072–5376 dims, so 512 is trivial. ([Upstash: Serverless Data Platform][23])
* **Filtering:** metadata stored per vector; filter operators support equality, numeric ranges, etc., with queries returning only vectors matching filter criteria. ([Upstash: Serverless Data Platform][24])

  * Storing `event_id` in metadata is standard and explicitly supported.
* **Latency:** docs emphasize “ultra-low latency” vector search suitable for production; it’s built on DiskANN tuned for NVMe. External benchmarks show DiskANN-style systems handle 1M vectors with sub-10–20 ms query times on commodity hardware. ([Upstash: Serverless Data Platform][22])

### 4.2 Cost model (re-stated)

* **Requests:** $0.40 per 100k operations (queries + writes). ([Upstash: Serverless Data Platform][12])
* **Storage:** $0.25/GB-month, first 1GB free. ([Upstash: Serverless Data Platform][12])
* **Scale to zero:** explicit “price scales to zero” – if your vectors and requests are small/infrequent, cost is near zero. ([Upstash: Serverless Data Platform][25])

At Tier3 worst-case ingestion (1.25M writes + 100k queries per month) you land at **≈$5.8/month** as above; Tier1/Tier2 are effectively near-free.

### 4.3 Operational / integration

* **API surface:** REST + official SDKs (TS, Python, etc.) with simple `index.query()` and `index.upsert()` style APIs. ([Upstash: Serverless Data Platform][26])
* **Serverless alignment:** Upstash is explicitly marketed as serverless, priced per request, often used from Next.js / Vercel / Workers / Lambda. ([Upstash: Serverless Data Platform][27])
* **Cold start:** Upstash itself doesn’t have your compute cold-start issues; your latency is network RTT + index latency.
* **Complexity:** You maintain a **separate vector store** plus Neon for metadata. Need to keep `face_id`/`event_id` metadata consistent across systems.

---

## 5. Option 3 – Cloudflare Vectorize (serverless edge)

### 5.1 Technical

* **Architecture:** globally distributed vector DB integrated with Cloudflare Workers; built as a fully serverless index – no cluster sizing. ([The Cloudflare Blog][28])

* **Dimensions & scale:** supports millions of vectors per index; exact dimension limits depend on configuration but 512 dims is standard in examples. ([Cloudflare Docs][29])

* **Index type:** HNSW-style ANN under the hood (Cloudflare docs do not expose the exact algorithm but describe dynamic index optimization). ([The Cloudflare Blog][28])

* **Filtering:** rich **metadata filtering**; filter is applied before top-K selection, supporting typical business filters like tenant IDs, categories, etc. ([Cloudflare Docs][30])

  * `event_id` is a standard “tenant/id” style use case.

* **Latency:**

  * Vectorize runs co-located with Workers, which advertise **cold start <10 ms** and general 10s of ms for edge compute. ([gocodeo.com][31])
  * For 1–2M vectors, HNSW search at edge normally achieves p50 in low tens of milliseconds; there are not precise public p95 numbers, but design goal is <50 ms plus network.

### 5.2 Cost

* Pricing recap from §2:

  * You pay only for **stored dims** and **queried dims**, no “active hours”. ([Cloudflare Docs][32])
  * At Tier3, your workload fits into ≈**$0.33/mo** of Vectorize fees; the dominant cost is Workers paid plan (~$5/mo).

This gives roughly **$5–5.3/month** at your current scale.

### 5.3 Integration

* **Face AI + Vectorize:**

  * If you also run inference on Workers AI, entire pipeline (selfie → embedding → vector search) can live at edge; Neon can remain metadata store only.
* **Neon integration:**

  * Pattern: write face metadata to Neon and vector + `event_id` to Vectorize; use a shared `face_id` key. Workers can reach both Neon (via HTTP / pg-proxy) and Vectorize from the same runtime.
* **Scale-to-zero:**

  * No cluster, no idle compute cost; you only pay for stored/queried dimensions and Workers CPU, which themselves scale to zero. ([The Cloudflare Blog][13])

---

## 6. Option 4 – Pinecone Serverless

### 6.1 Technical

* **Index types:** proprietary ANN based on optimized HNSW + product quantization; well known for high performance at 10M+ vectors. ([Milvus][33])
* **Dimensions:** supports up to ~20k dims depending on region/plan; 512 dims trivial. ([liveblocks.io][34])
* **Filtering:**

  * Strong **metadata filtering** integrated into retrieval path, using “metadata slabs” in their serverless architecture. ([Pinecone][35])
  * `event_id` as metadata is typical; also supports compound filters with boolean operators.
* **Latency:**

  * Published stats indicate **p50 latency <10 ms, p99 <50 ms** even at billion-scale indexes. ([aloa.co][36])

### 6.2 Cost

* For your scale, the **$50/month minimum on Standard** dominates actual consumption pricing. ([MetaCTO][14])

At your size (≤2.5GB, ≤100k queries/month), Pinecone is technically over-provisioned; you’re paying for capacity you don’t use.

### 6.3 Operational / integration

* **Operational:** fully managed, no infra to run, multi-region, high SLA (often 99.99%). ([aloa.co][37])
* **Integration:**

  * Mature ecosystem with many SDKs and framework connectors (LangChain, LlamaIndex, etc.), trivial to use from serverless APIs.

---

## 7. Option 5 – Qdrant (Cloud & self-host)

### 7.1 Technical

* **Index:** HNSW with “filter-aware” optimizations; supports dense and sparse vectors. ([Qdrant][38])
* **Dimensions:** supports thousands of dims (512 trivial).
* **Filtering:**

  * **Payload** JSON per vector; flexible conditions (`must`, `should`, range filters, etc.); recommended to index frequently filtered fields for performance. ([Qdrant][38])
  * `event_id` fits naturally as a payload field; Qdrant docs emphasize filtering as a “superpower” and show it working efficiently with HNSW. ([cohorte.co][39])
* **Latency:**

  * Benchmarks from Qdrant and independent analyses show single-query latency in tens of ms, and at 99% recall both Qdrant and Postgres+pgvector remain <100 ms; Qdrant generally has better p95/p99 tails while Postgres can show higher throughput. ([tigerdata.com][15])

### 7.2 Qdrant Cloud

* **Pricing:**

  * Managed Qdrant Cloud free tier: 1GB storage free; beyond that, small clusters from about **$0.014/hour** (~$10/month) plus storage. ([Qdrant][5])
* **Scale-to-zero:**

  * Clusters are provisioned; you pay while they exist, even if idle – not true scale-to-zero.

### 7.3 Self-host Qdrant / Milvus

* **Infra cost:**

  * Open-source, no license fee; a single small VM (2 vCPU, 4–8 GB RAM, 50–100 GB SSD) on a commodity provider (~$5–15/month) is enough for 1–2M vectors. ([Airbyte][8])
* **Ops:**

  * You must own backup, monitoring, upgrades, and high availability.

---

## 8. Option 6 – Weaviate Cloud (serverless)

### 8.1 Technical

* **Index:** HNSW, plus optional flat and quantized indexes; multi-modal modules (text, image, etc.). ([Medium][6])
* **Filtering:** GraphQL-based query model with flexible filters; works well with multi-field payloads (e.g. `event_id` + other tags). ([aloa.co][40])
* **Latency:**

  * Comparable to other HNSW vector DBs (tens of ms at millions of vectors) according to third-party benchmarks. ([Medium][6])

### 8.2 Cost

* As above, base **$25/month** + **$0.095 per 1M vector dimensions** stored. ([AI Tools][41])
* At Tier3 (~640M dims) → **~$85.8/month**; there is no “scale to near zero” at your scale.

### 8.3 Operational

* Fully managed, but cost floor is high relative to your footprint; operations and scaling are largely handled for you.

---

## 9. Serverless vs In-DB Integration Considerations

### 9.1 Face AI embeddings

* **Embedding size alignment:**

  * All options accept 512-dim float vectors; no constraints beyond dimension count and numeric type.
* **Where to run face embedding inference:**

  * If you already use Neon-centric backend, running inference in your API and writing into **Neon+pgvector** keeps architecture simple.
  * If you move toward **edge inference** (Cloudflare Workers AI), then **Cloudflare Vectorize** gives a “all-on-edge” pipeline; Neon becomes metadata repository only. ([Cloudflare Docs][29])

### 9.2 Metadata DB (Neon) vs external vector DB

Questions to consider (not recommendations):

* **Join locality:**

  * Neon+pgvector allows a single SQL query to apply `event_id` filter + vector search + any other relational joins.
  * External vector stores require two hops: vector DB for nearest neighbors → fetch metadata from Neon via IDs.
* **Operational boundaries:**

  * Keeping vectors in Neon keeps everything under one failure domain.
  * External vector DB separates compute concerns (vector load vs transactional load).

### 9.3 API backend and serverless

* **Neon**:

  * Cold start: DB compute can take **hundreds of ms** to resume after 5 minutes idle; you can disable scale-to-zero on paid plans if cold starts matter more than cost. ([Neon][20])
  * You must handle Postgres connection pooling carefully from serverless (Neon provides guidance and pooling endpoints). ([DEV Community][42])
* **Upstash / Vectorize / Pinecone:**

  * Designed for serverless; HTTP APIs fit well with ephemeral compute and do not require long-lived connections.

---

## 10. Accuracy vs Speed Trade-offs

At **~1M vectors, 512 dims**, all the listed ANN systems can hit <100ms latency. Trade-offs are more about recall vs resources:

* **Neon + pgvector**

  * IVFFlat: faster but recall depends heavily on `lists` and `probes`. ([tigerdata.com][43])
  * HNSW: generally higher recall and more stable latency; memory usage grows with N; Neon and Timescale benchmarks show sub-100ms even at 50M vectors if tuned. ([DEV Community][44])

* **Upstash (DiskANN)**

  * DiskANN is designed for disk-backed indexes with **low recall loss at high compression**, typically competitive with or better than HNSW in cost/latency at large N. ([Upstash: Serverless Data Platform][22])

* **Cloudflare Vectorize / Pinecone / Qdrant / Weaviate**

  * All use HNSW or similar graph-based ANN; benchmarks (e.g. ann-benchmarks, vendor blogs) show **p50/p95 latencies in tens of ms at millions of vectors**; Pinecone is optimized for extreme scale, Qdrant for strong filtering, Weaviate for hybrid multi-modal. ([Qdrant][45])

---

## 11. Category Summary (per your “Categories to Explore”)

### 11.1 Postgres extensions (with Neon)

* **Neon + pgvector** (current-best supported path; `pg_embedding` is effectively deprecated by Neon in favor of pgvector). ([GitHub][46])
* Characteristics:

  * Very low incremental cost at your scale.
  * Latency within budget based on public benchmarks.
  * Event filtering trivial via SQL.
  * Scale-to-zero already wired to your DB.
  * Single-system architecture.

### 11.2 Dedicated vector DBs – managed

* **Pinecone, Qdrant Cloud, Weaviate Cloud, Zilliz Cloud**

  * All satisfy technical requirements (dims, latency, filtering).
  * At your scale, **minimum monthly cost (≥$10–50+) dominates**.
  * Operationally convenient but not cost-optimized for 2.5GB / 100k queries/month workloads.

### 11.3 Dedicated vector DBs – self-hosted

* **Self-hosted Qdrant / Milvus / Weaviate**

  * Technically robust with low latency at millions of vectors.
  * Cost dominated by 24/7 VM (~$5–15/month) plus ops overhead; no scale-to-zero.

### 11.4 Serverless vector solutions

* **Upstash Vector**

  * Per-request + per-GB, first 1GB free; explicitly scales cost to zero.
  * DiskANN engine, metadata filtering, global distribution options.
  * At your scale, cost stays in single-digit USD/month even under worst-case ingestion assumptions.

* **Cloudflare Vectorize**

  * Dimension-based billing, no active-hours cost.
  * Tight integration with Workers AI for full edge pipeline.
  * At your scale, ~$5–5.3/month, dominated by Workers plan.

---

## 12. Integration & Design Considerations (Cross-cutting)

Structured around your table:

| Connects To            | Key points for each option                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Face AI**            | All options support 512-dim floats. If you run inference centrally (API backend), Neon+pgvector keeps data co-located. If you move inference to edge, Vectorize aligns naturally; Upstash also fits edge/serverless well. ([Neon][1])                |
| **Metadata DB (Neon)** | Neon+pgvector collapses vector + relational into one system. Upstash/Vectorize/Pinecone/Qdrant require dual-write or a synchronization scheme keyed by `face_id`/`event_id`.                                                                         |
| **API Backend**        | For Neon, use pooled Postgres connections (Neon pooling, PgBouncer, or HTTP proxy). For external vector DBs, your backend simply does one HTTP call to vector DB then one SQL query to Neon to hydrate metadata. ([DEV Community][42])               |
| **Serverless**         | Neon provides serverless DB with cold starts after 5min idle; external serverless vector DBs (Upstash, Vectorize) have no DB cold start, only API latency. Cloudflare Workers and Upstash both emphasize pay-per-use and scale-to-zero. ([Neon][20]) |

---

## 13. Open Questions / Follow-ups

These are questions that surfaced during research; answering them will tighten the design space:

1. **Headroom beyond Tier3:**

   * Do you anticipate going from ~1.25M → 10M+ face embeddings per year soon? If yes, pgvector remains viable but specialized vector DBs (Pinecone, Qdrant, Milvus) become more attractive from an ops and latency perspective based on 10M+ benchmarks. ([Medium][17])

2. **Latency budget allocation:**

   * Your <100ms SLO includes end-to-end path. How much is budgeted for DB vs network vs inference? This may tilt choices toward edge (Vectorize) if a significant fraction of users are far from your Neon region.

3. **Event distribution shape:**

   * How bursty are events and uploads? If events create short, high-load “spikes” then long idle gaps, serverless-priced vector DBs (Upstash/Vectorize) align strongly with your cost profile; if traffic becomes more 24/7, the calculus changes.

4. **Multi-tenant events / isolation:**

   * Do you need strong isolation between events or customers?

     * In Neon+pgvector you’d typically use `event_id` filters or partitioning.
     * In external vector DBs you can use **namespaces / collections per event** (supported by Qdrant, Pinecone, Upstash, Vectorize). ([Qdrant][45])

5. **Ops appetite vs external dependencies:**

   * Are you comfortable adding another core external SaaS dependency beyond Neon? If not, that pushes harder toward “just use Neon+pgvector now, revisit dedicated vector DB at ≥10M vectors or new latency requirements”.

6. **Regulatory / data locality constraints:**

   * If you need to keep face embeddings in particular regions only, check the region coverage for Upstash / Vectorize / Pinecone / Qdrant vs your Neon region choices. ([Upstash: Serverless Data Platform][47])

---


[1]: https://neon.com/docs/extensions/pgvector?utm_source=chatgpt.com "The pgvector extension - Neon Docs"
[2]: https://upstash.com/docs/vector/overall/whatisvector?utm_source=chatgpt.com "What is Upstash Vector?"
[3]: https://developers.cloudflare.com/workers/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Workers docs"
[4]: https://www.withorb.com/blog/pinecone-pricing?utm_source=chatgpt.com "Pinecone pricing: Features and plans explained + how ..."
[5]: https://qdrant.tech/pricing/?utm_source=chatgpt.com "Pricing for Cloud and Vector Database Solutions Qdrant"
[6]: https://medium.com/%40elisheba.t.anderson/choosing-the-right-vector-database-opensearch-vs-pinecone-vs-qdrant-vs-weaviate-vs-milvus-vs-037343926d7e?utm_source=chatgpt.com "OpenSearch vs Pinecone vs Qdrant vs Weaviate vs Milvus ..."
[7]: https://zilliz.com/pricing?utm_source=chatgpt.com "Zilliz Cloud Pricing - Fully Managed Vector Database for AI ..."
[8]: https://airbyte.com/data-engineering-resources/milvus-database-pricing?utm_source=chatgpt.com "Milvus Vector Database Pricing: Cloud & Self-Hosted"
[9]: https://medium.com/%40alexeylark/neon-does-going-serverless-solve-fixed-expenses-for-postgres-b54786af3f40?utm_source=chatgpt.com "Neon: Does Going Serverless Solve Fixed Expenses for ..."
[10]: https://www.withorb.com/blog/neon-pricing?utm_source=chatgpt.com "Neon pricing: Features and plans explained"
[11]: https://neon.com/docs/introduction/plans?utm_source=chatgpt.com "Neon plans - Neon Docs"
[12]: https://upstash.com/blog/what-are-vectors?utm_source=chatgpt.com "What are Vectors and Why Store Them in a ..."
[13]: https://blog.cloudflare.com/workers-pricing-scale-to-zero/?utm_source=chatgpt.com "New Workers pricing — never pay to wait on I/O again"
[14]: https://www.metacto.com/blogs/the-true-cost-of-pinecone-a-deep-dive-into-pricing-integration-and-maintenance?utm_source=chatgpt.com "The True Cost of Pinecone - Pricing, Integration, and More"
[15]: https://www.tigerdata.com/blog/pgvector-vs-qdrant?utm_source=chatgpt.com "Pgvector vs. Qdrant: Open-Source Vector Database ..."
[16]: https://mastra.ai/blog/pgvector-perf?utm_source=chatgpt.com "Benchmarking pgvector RAG performance across different ..."
[17]: https://medium.com/%40DataCraft-Innovations/postgres-vector-search-with-pgvector-benchmarks-costs-and-reality-check-f839a4d2b66f?utm_source=chatgpt.com "Postgres Vector Search with pgvector: Benchmarks, Costs ..."
[18]: https://medium.com/%40besttechreads/step-by-step-guide-to-installing-pgvector-and-loading-data-in-postgresql-f2cffb5dec43?utm_source=chatgpt.com "Step-by-Step Guide to Installing “pgvector” and Loading ..."
[19]: https://www.pinecone.io/blog/pinecone-vs-pgvector/?utm_source=chatgpt.com "Pinecone vs. Postgres pgvector: For vector search, easy ..."
[20]: https://neon.com/docs/introduction/scale-to-zero?utm_source=chatgpt.com "Scale to Zero - Neon Docs"
[21]: https://neon.com/faster?utm_source=chatgpt.com "Faster is what we help you ship"
[22]: https://upstash.com/docs/vector/features/algorithm?utm_source=chatgpt.com "Algorithm - Upstash Documentation"
[23]: https://upstash.com/docs/vector/help/faq?utm_source=chatgpt.com "FAQ - Upstash Documentation"
[24]: https://upstash.com/docs/vector/features/filtering?utm_source=chatgpt.com "Metadata Filtering - Upstash Documentation"
[25]: https://upstash.com/docs/common/concepts/scale-to-zero?utm_source=chatgpt.com "Scale to Zero - Upstash Documentation"
[26]: https://upstash.com/docs/vector/sdks/ts/commands/query?utm_source=chatgpt.com "Query - Upstash Documentation"
[27]: https://upstash.com/?utm_source=chatgpt.com "Upstash: Serverless Data Platform"
[28]: https://blog.cloudflare.com/building-vectorize-a-distributed-vector-database-on-cloudflare-developer-platform/?utm_source=chatgpt.com "Building Vectorize, a distributed vector database, on ..."
[29]: https://developers.cloudflare.com/vectorize/get-started/intro/?utm_source=chatgpt.com "Introduction to Vectorize"
[30]: https://developers.cloudflare.com/vectorize/reference/metadata-filtering/?utm_source=chatgpt.com "Metadata filtering - Vectorize"
[31]: https://www.gocodeo.com/post/running-ai-at-the-edge-how-cloudflare-workers-support-serverless-intelligence?utm_source=chatgpt.com "Running AI at the Edge: How Cloudflare Workers Support ..."
[32]: https://developers.cloudflare.com/vectorize/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Vectorize docs"
[33]: https://milvus.io/ai-quick-reference/what-are-the-latency-benchmarks-for-leading-ai-databases?utm_source=chatgpt.com "What are the latency benchmarks for leading AI databases?"
[34]: https://liveblocks.io/blog/whats-the-best-vector-database-for-building-ai-products?utm_source=chatgpt.com "What's the best vector database for building AI products?"
[35]: https://www.pinecone.io/research/accurate-and-efficient-metadata-filtering-in-pinecones-serverless-vector-database/?utm_source=chatgpt.com "Accurate and Efficient Metadata Filtering in Pinecone's ..."
[36]: https://aloa.co/ai/comparisons/vector-database-comparison/pinecone-vs-weaviate?utm_source=chatgpt.com "Pinecone vs Weaviate 2025 - Vector Databases"
[37]: https://aloa.co/ai/comparisons/vector-database-comparison/pinecone-vs-zilliz-cloud?utm_source=chatgpt.com "Pinecone vs Zilliz Cloud 2025 - Vector Databases"
[38]: https://qdrant.tech/documentation/concepts/filtering/?utm_source=chatgpt.com "Filtering"
[39]: https://www.cohorte.co/blog/a-developers-friendly-guide-to-qdrant-vector-database?utm_source=chatgpt.com "A Developer's Friendly Guide to Qdrant Vector Database"
[40]: https://aloa.co/ai/comparisons/vector-database-comparison/weaviate-vs-qdrant?utm_source=chatgpt.com "Weaviate vs Qdrant 2025 - Vector Databases"
[41]: https://aitools.inc/tools/weaviate?utm_source=chatgpt.com "Weaviate Features, Pricing, and Alternatives - AI Tools"
[42]: https://dev.to/neon-postgres/building-intelligent-search-with-ai-embeddings-neon-and-pgvector-3hep?utm_source=chatgpt.com "Building Intelligent Search with AI Embeddings, Neon, and ..."
[43]: https://www.tigerdata.com/blog/how-we-made-postgresql-the-best-vector-database?utm_source=chatgpt.com "How We Made PostgreSQL a Better Vector Database"
[44]: https://dev.to/tigerdata/postgresql-vs-qdrant-for-vector-search-50m-embedding-benchmark-3hhe?utm_source=chatgpt.com "PostgreSQL vs. Qdrant for Vector Search: 50M Embedding ..."
[45]: https://qdrant.tech/benchmarks/?utm_source=chatgpt.com "Benchmarking Vector Databases"
[46]: https://github.com/neondatabase-labs/pg_embedding?utm_source=chatgpt.com "neondatabase-labs/pg_embedding"
[47]: https://upstash.com/pricing/vector?utm_source=chatgpt.com "Pricing & Limits"
