## 0. Objective & Constraints

* Task: **face detection + embedding generation** for recognition/search.
* Targets: **≥98% verification accuracy** (dataset-dependent) and **scale from 15K → 157K → 1.25M faces/month**.
* Output here:

  * Map the **solution space** (Phase 1).
  * Propose a **shortlist + cost model + integration considerations** (Phase 2).
  * Keep evaluation **data-driven**, with explicit assumptions and citations.

---

## 1. Research Plan

1. **Landscape scan (Phase 1)**

   * Enumerate solutions in 4 categories: self-hosted OSS, cloud APIs, edge/on-device SDKs, hybrid patterns.
   * Capture license constraints, accuracy signals, and deployment model.

2. **Narrow to shortlists (Phase 2 – functional)**

   * Choose a small number of **archetypal options** that realistically meet 98%+ accuracy and scale requirements.
   * For each: operational model, detection/embedding approach, pros/risks (license, privacy, complexity).

3. **Cost modeling (API & illustrative self-hosted)**

   * Compute **cost/face** and monthly cost for **15.5K / 157K / 1.25M faces** for key cloud APIs.
   * Provide **illustrative infra cost** for a GPU-based self-hosted stack with explicit throughput assumptions.

4. **Integration points & technical details**

   * Document **detector + embedder** choices, embedding dimensions, latency ballpark.
   * Map into your **object storage, vector DB, image pipeline, serverless** constraints.

**Coverage check:** the plan hits all parts of your template (solutions, shortlist, costs, integration, technical). Next: Phase 1.

---

## 2. Phase 1 – Landscape: Solutions by Category

### 2.1 Self-Hosted Open-Source Models

These all require you to handle infra, scaling, and sometimes licensing.

| Solution                                                           | Category        | Notes (Detection + Embedding)                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **InsightFace (RetinaFace / SCRFD + ArcFace / MagFace / AdaFace)** | Self-hosted OSS | InsightFace is a **full face analysis library** with SOTA detectors (RetinaFace, SCRFD) and recognizers (ArcFace, MagFace, AdaFace). Used widely in research/industry; original models are **research-only** and require separate **commercial license** from InsightFace for production use. ([GitHub][1]) |
| **ArcFace implementations (e.g., IResNet-100, WebFace4M/MS1MV2)**  | Self-hosted OSS | ArcFace-type models reach **~99.78% on LFW** and ~**98–99% TAR at low FAR on IJB-C** when trained on large datasets, satisfying the 98%+ requirement in standard benchmarks. ([ResearchGate][2]) Detection must be paired with a separate model (e.g., RetinaFace).                                         |
| **MagFace**                                                        | Self-hosted OSS | Embedding model with **quality-aware magnitudes**, improving verification on challenging datasets IJB-B/IJB-C over ArcFace. ([GitHub][3]) Detection again via RetinaFace/SCRFD.                                                                                                                             |
| **AdaFace**                                                        | Self-hosted OSS | Loss/function and models that adapt margin to image quality; improves **TAR@FAR=0.01%** on IJB-B/C vs prior SOTA and is specifically tuned for mixed/low-quality faces. ([CVF Open Access][4])                                                                                                              |
| **FaceNet / derivatives**                                          | Self-hosted OSS | Older but still strong; typical reports **~99.7% on LFW**; many TFLite and mobile-friendly ports exist (including reference Android on-device example). ([PMC][5])                                                                                                                                          |
| **deepface (Python lib)**                                          | Self-hosted OSS | Python wrapper around several backends (ArcFace, Facenet, VGGFace, etc.) and detectors (RetinaFace, MTCNN) to provide an **end-to-end pipeline** with less glue code. ([GitHub][6])                                                                                                                         |
| **dlib + ResNet face recognition**                                 | Self-hosted OSS | CPU-friendly, simpler pipeline; generally lower accuracy and robustness on unconstrained datasets vs modern ArcFace/MagFace/AdaFace but still widely used for small-scale deployments. (Well-known in community; limited recent benchmark data.)                                                            |
| **OpenCV DNN + third-party embeddings (e.g., OpenFace)**           | Self-hosted OSS | Uses OpenCV’s DNN detectors plus older embedding models; more traditional, often below modern SOTA on unconstrained benchmarks.                                                                                                                                                                             |

**Signal:** modern InsightFace-style stacks (RetinaFace/SCRFD + ArcFace/MagFace/AdaFace) represent current **high-accuracy, self-hosted** baseline for detection + embedding.

---

### 2.2 Cloud AI APIs

These provide managed detection/recognition; you trade control for operational simplicity and vendor lock-in.

| Solution                                 | Category        | Notes                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Amazon Rekognition**                   | Cloud API       | Supports **face detection, face search, and face collections (stored embeddings)**. Pricing widely documented at around **$1 per 1,000 images** for standard image analysis features (tiered, excl. free-tier and storage). ([DataCamp][7]) No direct access to raw embeddings, but effectively acts as a face embedding + search service. |
| **Azure Face API (Azure AI Face)**       | Cloud API       | Provides detection, verification, identification, face storage, and liveness. Public info and third-party breakdowns show **face detection from ~$1.5 per 1,000 transactions** with free tier (~30K/month). ([Microsoft Azure][8]) Uses Microsoft’s FRVT-competitive algorithms (ranked highly in NIST tests). ([IDEMIA][9])               |
| **Google Cloud Vision (Face Detection)** | Cloud API       | Face detection (bounding boxes + landmarks, emotion, etc.). Pricing docs + secondary sources indicate **first 1,000 units free, then ~$1.50 per 1,000 face detection calls**. ([Google Cloud Documentation][10]) No public face-search/embedding API; you’d add your own vector DB.                                                        |
| **Face++**                               | Cloud API       | China-based; supports detection, recognition, attributes, and dense landmarks. Pay-as-you-go pricing examples: some dense landmark APIs **$0.03/call**, with separate face recognition tiers. ([faceplusplus.com][11]) Typically exposes feature vectors and galleries.                                                                    |
| **Luxand.cloud**                         | Cloud API       | Cloud face recognition/verification with multiple plans; public pricing examples: **$19/10K requests, $99/200K, $249/500K** (≈$1.9, $0.495, $0.498 per 1K requests). ([SoftwareSuggest][12])                                                                                                                                               |
| **Kairos**                               | Cloud + On-prem | Face recognition with strong privacy/ethics positioning; cloud and on-prem deployment options; pricing mixes base subscription plus per-call fees. ([kairos.com][13])                                                                                                                                                                      |
| **SkyBiometry**                          | Cloud API       | Face detection/recognition with free tier (5K calls/month) and commercial plans starting around **€50 for 40K calls** with overage ≈€0.0125/call. ([Software Finder][14])                                                                                                                                                                  |
| **Clarifai / API4AI / others**           | Cloud API       | Multiple vendors (Clarifai, API4AI, etc.) provide generic vision APIs including face detection/recognition; these often integrate via aggregator platforms and have varied pricing/SLAs. ([Eden AI][15])                                                                                                                                   |

---

### 2.3 Edge / On-Device Solutions

These focus on running **locally on mobile/desktop** (often with optional cloud backends).

| Solution                                                          | Category              | Notes                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MediaPipe Face Detection + Face Landmarker**                    | Edge OSS              | Ultrafast, mobile-optimized face detector based on BlazeFace, with optional detailed landmarks and expression estimates. Supports Android, iOS, Web, and native via prebuilt models and APIs. ([mediapipe.readthedocs.io][16]) |
| **Google ML Kit Face Detection**                                  | Edge SDK              | On-device face detection (bounding boxes, landmarks, contours, classifications) for iOS/Android; can run fully offline. ([Google for Developers][17])                                                                          |
| **Apple Vision framework**                                        | Edge SDK              | On-device face detection, landmarks, quality score (VNDetectFaceCaptureQualityRequest), head pose, etc., for iOS/macOS. ([Apple Developer][18])                                                                                |
| **On-device FaceNet / MobileFaceNet (TFLite)**                    | Edge OSS              | Examples and open-source apps show complete Android on-device recognition pipelines using FaceNet embeddings + local vector DB. ([GitHub][19])                                                                                 |
| **NVIDIA Maxine AR SDK**                                          | Edge/Server SDK       | GPU-accelerated SDK for **real-time face detection and tracking**, landmarks, and 3D face mesh on RTX-class GPUs; targets desktop/edge servers. ([NVIDIA Docs][20])                                                            |
| **Luxand FaceSDK**                                                | Edge SDK (commercial) | Cross-platform face detection/recognition SDK for Win/Mac/Linux/iOS/Android; runs fully on-device or on your servers. ([luxand.com][21])                                                                                       |
| **Banuba Face Recognition SDK**                                   | Edge SDK (commercial) | Mobile and cross-platform SDK with face recognition, verification, and anti-spoofing; supports Android, iOS, Web, Unity etc. ([banuba.com][22])                                                                                |
| **Other commercial on-prem SDKs (FacePlugin, KBY-AI, Recognito)** | Edge/On-prem SDK      | Multiple vendors (FacePlugin, KBY-AI, Recognito) provide on-prem or mobile SDKs emphasizing privacy and NIST FRVT rankings. ([faceplugin.com][23])                                                                             |

---

### 2.4 Hybrid Approaches (Patterns, not Single Products)

Common architecture patterns:

1. **Self-hosted microservice + cloud vector DB**

   * Detector/embedding: InsightFace stack on GPU VMs or Kubernetes.
   * Vector DB: Pinecone, Milvus, Qdrant, or pgvector for embeddings + metadata.
   * Pros: full control over embeddings; can tune thresholding and quality; no raw faces sent to third-party API.
   * Cons: manage GPU infra, autoscaling, and deployment complexity.

2. **Edge detection + cloud embedding/search**

   * Detection/landmarks: MediaPipe / ML Kit / Vision on device.
   * Crop + compress face ROI → send to cloud service (Rekognition, Azure Face, or your own embedding service) → store in cloud vector DB.
   * Pros: lower bandwidth, some privacy benefits (no whole image); cons: still cloud-centric, needs robust client code.

3. **On-prem SDK + cloud storage**

   * Use commercial SDK (Luxand FaceSDK, Kairos on-prem, etc.) to generate embeddings locally.
   * Persist embeddings and original images in **your object storage + vector DB**, optionally syncing anonymized stats to cloud.

**Coverage check:** we have at least one concrete option in each category, plus major variations (OSS, big-cloud APIs, mobile SDKs, hybrid patterns). Next: shortlist.

---

## 3. Phase 2 – Shortlisted Archetypes

Given your requirements (98%+, 15K–1.25M faces/month, detection + embedding), four practical **archetypes** emerge:

1. **A — Self-hosted SOTA stack (InsightFace + vector DB)**
2. **B — AWS Rekognition (managed detection + face collections)**
3. **C — Azure Face / Google Vision (managed detection; Azure adds recognition)**
4. **D — Edge-centric (MediaPipe/ML Kit + your own embeddings)**

(Cloud API vendors like Face++, Luxand, Kairos/SkyBiometry are similar to B/C but outside the “big three”; they can be considered **B-variants**.)

### 3.1 Archetype A – Self-Hosted InsightFace / AdaFace Stack

**Detection + Embedding**

* Detector: **SCRFD or RetinaFace** from InsightFace; efficient and high-accuracy face detection on unconstrained imagery. ([GitHub][1])
* Embeddings: **ArcFace / MagFace / AdaFace** (e.g., IResNet-100 or similar backbones) with **512-D feature vectors**, achieving:

  * ~**99.7–99.8% accuracy on LFW** ([ResearchGate][2])
  * **TAR >98% at very low FAR** on IJB-C for best SOTA methods (MagFace, AdaFace, etc.). ([GitHub][3])

**Licensing / Compliance**

* Important: InsightFace explicitly states that their open-source models are **for academic research only**; commercial use requires a separate license from them. ([insightface.ai][24])
* For a production system, you either:

  * Obtain a **commercial license** from InsightFace, or
  * Use another SDK/vendor whose models are licensed for commercial usage (e.g., KBY-AI SDK, Banuba, etc.) while keeping a similar architecture. ([KBY-AI][25])

**Infra assumptions (for cost modeling later)**

* Example GPU node: **AWS g4dn.xlarge** (~$0.53/hour in us-east-1). ([Vantage Instances][26])
* A modern ArcFace-class model on a T4 GPU can typically process **O(100) images/s** end-to-end with batching; we’ll use this as an explicit assumption in the cost section (not a vendor spec).

---

### 3.2 Archetype B – AWS Rekognition

**Functionality**

* Detection: face bounding boxes, landmarks, facial attributes. ([Amazon Web Services, Inc.][27])
* Embeddings: Rekognition manages **face vectors internally**; you create **face collections** and then use search/compare APIs rather than handling raw embeddings yourself.
* Accuracy: AWS does not publish LFW/IJB-C numbers, but Rekognition uses deep CNN models comparable to modern academic work and is widely used in production. ([DataCamp][7])

**Operational model**

* Pure **API-based**; no GPU infrastructure to manage.
* Data residency and compliance determined by AWS region and your own storage policies.

---

### 3.3 Archetype C – Azure Face API / Google Cloud Vision

**Azure Face**

* Detection, identification (1:N with person groups), verification (1:1), and face storage. ([Microsoft Azure][8])
* Strong FRVT positioning: Microsoft algorithms consistently rank high in **NIST FRVT** benchmarks. ([IDEMIA][9])
* Suitable when you are already invested in Azure (storage, App Services, Functions).

**Google Cloud Vision**

* Face detection only (no built-in face galleries). ([Google Cloud Documentation][28])
* You would use Vision for detection + landmarks, then run your own embedding model (e.g., AdaFace on Cloud Run or GKE) and store embeddings in Bigtable/Spanner/Cloud SQL or a vector DB.

---

### 3.4 Archetype D – Edge-Centric Pipelines (MediaPipe / ML Kit / Vision)

**Detection**

* ML Kit face detection (Android/iOS) and Apple Vision run **entirely on device** and are designed for real-time performance. ([Google for Developers][17])
* MediaPipe Face Detection / Face Landmarker adds ultra-fast, GPU-optimized models with landmarks for cross-platform apps. ([mediapipe.readthedocs.io][16])

**Embeddings**

* Two common patterns:

  * **On-device embeddings** (e.g., TFLite FaceNet/MobileFaceNet) + local store; occasionally sync embeddings or template hashes to backend. ([GitHub][19])
  * **Cloud embeddings**: only send cropped/normalized faces to backend embedding service for storage/search.

**When it fits**

* Strong requirement for **privacy** (faces rarely leave device), or low network availability.
* You still need some backend for **enrollment, deduplication, and cross-device identity**.

**Coverage check:** we now have a concrete, representative shortlist matching your functional needs.

Next: cost modeling for the most quantifiable options (cloud APIs), plus an illustrative self-hosted GPU scenario.

---

## 4. Cost Comparison – Per Face and Monthly

### 4.1 Assumptions

* Volumes per month (faces processed; treat one image ≈ one face for cost ballpark):

  * **Tier 1:** 15.5K faces → **15,500** API calls.
  * **Tier 2:** 157K faces → **157,000** API calls.
  * **Tier 3:** 1.25M faces → **1,250,000** API calls.
* Ignore free tiers and fine-grained tiering; assume **flat per-1,000 pricing** for comparability.
* Use recent public or secondary-source pricing numbers:

  * **AWS Rekognition (image analysis / face)**: ≈ **$1.00 per 1,000 images** after free tier. ([DataCamp][7])
  * **Azure Face (face detection)**: starting ≈ **$1.50 per 1,000 transactions**. ([Microsoft Azure][8])
  * **Google Cloud Vision (face detection)**: ≈ **$1.50 per 1,000 units** after first 1,000 free. ([Google Cloud Documentation][10])
  * **Luxand.cloud**: Basic published price **$19 per 10,000 requests** → **$1.90 per 1,000**; at higher tiers it drops (~$0.50 per 1,000), but we’ll use the conservative Basic-rate for a simple comparison. ([SoftwareSuggest][12])

### 4.2 Cost/Face & Monthly Cost (Approximate)

*All numbers approximate, excluding free tiers & volume discounts; per-face cost = price_per_1000 / 1000.*

| Solution                            | Assumed Price        | Cost / Face | Tier 1 (15.5K) | Tier 2 (157K) | Tier 3 (1.25M) |
| ----------------------------------- | -------------------- | ----------- | -------------- | ------------- | -------------- |
| **AWS Rekognition**                 | $1.00 / 1,000 images | **$0.0010** | ~$15.50 (฿496) | ~$157 (฿5,017) | ~$1,250 (฿39,950) |
| **Azure Face (detection)**          | $1.50 / 1,000 tx     | **$0.0015** | ~$23.25 (฿743) | ~$235.50 (฿7,526) | ~$1,875 (฿59,925) |
| **Google Vision (face detection)**  | $1.50 / 1,000 units  | **$0.0015** | ~$23.25 (฿743) | ~$235.50 (฿7,526) | ~$1,875 (฿59,925) |
| **Luxand.cloud (Basic-equivalent)** | $1.90 / 1,000 req    | **$0.0019** | ~$29.45 (฿941) | ~$298.30 (฿9,531) | ~$2,375 (฿75,893) |

Key observation: **even at 1.25M faces/month**, raw API call costs remain in the **low thousands of USD** per month for major cloud providers under these assumptions. Relative differences between vendors are more significant than absolute magnitude.

---

### 4.3 Illustrative Self-Hosted GPU Cost

This is a **what-if model**, not vendor data.

Assumptions:

* **Instance:** AWS g4dn.xlarge (T4 GPU) at **~$0.53/hour** ($384/month ≈ ฿12,276/month at 100% utilization). ([Vantage Instances][26])
* **Throughput:** 100 faces/s end-to-end (detection + embedding) at good batch sizes on T4-class GPU (conservative for modern models).
* Monthly capacity at 100 faces/s:

  * 100 * 3600 * 24 * 30 ≈ **259M faces/month** if fully utilized.

Then:

* At **1.25M faces/month**, GPU would be utilized <1% of theoretical capacity; in practice you’d either:

  * Share the GPU with other workloads, or
  * Use smaller/spot instances or scale-to-zero container clusters.

Effective **infra cost/face** if you dedicated one g4dn.xlarge to face tasks and run it full-time at your scale:

* Cost/month ≈ $384 (on-demand). ([Economize Cloud][29])
* Faces/month (Tier 3) = 1.25M.
* **Cost/face ≈ $384 / 1,250,000 ≈ $0.00031** (about 3× cheaper per face than AWS API list price, under these assumptions).

However:

* At lower tiers, **under-utilization dominates**, so your effective cost/face rises unless you share the GPU with other workloads or scale down.

**Takeaway (purely quantitative):** at your target scales, **self-hosted GPU becomes cost-competitive** with cloud APIs if you maintain high utilization and can manage operational overhead; cloud APIs are cheaper in terms of **engineering time and operational complexity** but not necessarily on pure per-face compute cost.

---

## 5. Integration Points (Mapped to Your Table)

### 5.1 Object Storage

| Aspect          | Considerations                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region & egress | For AWS/Azure/GCP APIs, place images in the **same region** as the face API to avoid egress fees and reduce latency. Rekognition, Azure Face, and Vision all support regional endpoints. ([Amazon Web Services, Inc.][30]) |
| Access pattern  | Decide whether to store **original images** vs cropped faces; for privacy, you can discard originals after embedding and keep only cropped regions or embeddings.                                                          |
| Pre-processing  | For self-hosted models, minimize repeated IO by **batch loading** and using caching for hot images (e.g., on a local SSD or ephemeral volume).                                                                             |

### 5.2 Vector Store (Embeddings)

| Aspect         | Considerations                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding size | ArcFace/MagFace/AdaFace commonly use **512-dimensional** embeddings; some mobile models use 128 or 256. ([GitHub][31])                                  |
| Storage        | With 512-D float32, each embedding is ~2 KB; **1.25M faces ≈ 2.5 GB** of pure vectors, plus indices and metadata. This is tractable in most vector DBs. |
| Index type     | For latency: **HNSW or IVF-PQ** indexes are typical; many cloud vector DBs (Pinecone, Qdrant, Milvus, pgvector add-ons) support these.                  |
| Latency        | At 1.25M vectors, approximate KNN search in a decent index can be kept in the **single-digit ms** range on CPU if tuned appropriately.                  |

### 5.3 Image Pipeline

| Aspect             | Considerations                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-processing     | For SOTA models, use the exact **normalization, alignment, and crop** expected by the backbone (e.g., ArcFace likes aligned 112×112 or 128×128 crops). Misalignment significantly degrades accuracy on benchmarks like IJB-C. ([GitHub][1]) |
| Latency budget     | End-to-end (upload → detection → embedding → DB write) for cloud APIs is usually **<300 ms** per image; for self-hosted GPU, **<100 ms** per image is realistic even without aggressive batching.                                           |
| Batch vs streaming | For offline ingestion (e.g., existing gallery), run **batch jobs**; for real-time flows, use streaming/async queues (e.g., SQS/Kafka → worker pods).                                                                                        |

### 5.4 Serverless / Compute

| Aspect              | Considerations                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud APIs (B/C)    | Front your system with serverless (e.g., Lambda, Azure Functions, Cloud Functions) that call face APIs; these functions are mostly **network-bound**, so cold starts may dominate latency for low-traffic workloads. |
| Self-hosted GPU (A) | GPUs are typically run as **long-lived services** (K8s deployments, ECS services), not in serverless FaaS. Lambda-style GPU functions are emerging but less mature.                                                  |
| Edge-centric (D)    | Most compute happens on device; serverless backend handles **enrollment, identity management, and vector search**; scaling is dominated by DB and small APIs, not heavy ML compute.                                  |

---

## 6. Technical Details – Detection & Embedding Choices

### 6.1 Accuracy Targets vs Benchmarks

* Academic SOTA models (ArcFace, MagFace, AdaFace, CAFace, etc.) achieve:

  * **>99.8%** on LFW. ([ResearchGate][2])
  * **TAR in the high 98–99% range** at low FAR (1e-4–1e-6) on IJB-C when properly trained. ([GitHub][3])
* NIST FRVT 1:N evaluations show **top vendor algorithms** (e.g., NEC, IDEMIA, KBY-AI) reaching **~99.8% identification accuracy** on large-scale galleries of 10–12M faces. ([NEC Global][32])

These results indicate your **98%+ requirement is achievable** with:

* A well-implemented **InsightFace-style self-hosted stack**, or
* A **top-tier commercial vendor** (big-cloud Face APIs or specialized FRVT-ranked SDKs).

The exact number you see in production will depend on **capture quality, pose, demographics, camera type, and matching thresholds**.

---

### 6.2 Typical Pipeline Design (for Archetype A / Hybrid)

1. **Face detection & alignment**

   * Use **SCRFD or RetinaFace** detector → get bounding boxes + 5 keypoints. ([GitHub][1])
   * Perform **similarity transform** to align eyes/mouth to canonical positions; crop to model’s required resolution.

2. **Embedding generation**

   * Run AdaFace/MagFace/ArcFace model on the aligned crop to produce a **fixed-dimensional embedding** (e.g., 512-D).
   * Optionally, compute a **quality score** (e.g., using MagFace magnitude or AdaFace’s norm-based proxy) and store it alongside the embedding as metadata. ([GitHub][3])

3. **Storage & indexing**

   * Store `{embedding, subject_id, timestamp, quality, capture_metadata}` in your vector DB.
   * Use **quality thresholds** to discard low-quality faces or to weight matches.

4. **Matching**

   * KNN search in vector DB with cosine similarity or L2.
   * Set **thresholds** for verification (1:1) and identification (1:N) targeting your desired False Accept / False Reject trade-offs; tune using an internal validation set.

---

### 6.3 Edge / On-Device Technical Notes

* MediaPipe + TFLite FaceNet‐type pipelines typically use **quantized models** (8-bit) to run on mobile CPUs/NPUs efficiently. ([droidcon][33])
* Apple’s Vision framework exposes **capture quality metrics** that correlate with recognition performance; these can gate whether an image is acceptable for enrollment. ([Apple Developer][34])
* For privacy, on-device pipelines often only send **hashed identifiers or encrypted embeddings** to backend systems; recent research on **template protection** shows it is possible to keep TAR still >96% at very low FAR even with transformed templates. ([ScienceDirect][35])

---

## 7. Where This Leaves You (Next Steps for a Tech Lead)

Not prescribing decisions, just outlining **data you now have and what’s still open**:

1. **You have:**

   * A mapped solution space across **OSS, big-cloud APIs, edge SDKs, and hybrids**.
   * Approximate **cost/face and monthly costs** for several major cloud APIs at your three volume tiers.
   * Evidence that **98%+ accuracy** is realistic with modern SOTA or top FRVT-ranked vendors, provided the pipeline is implemented carefully.

2. **Still needed (implementation-time work):**

   * Define **data characteristics** (resolution, pose variation, lighting, camera types, demographics) and pick a **representative evaluation set** to measure actual TAR/FAR for any chosen solution.
   * Decide **licensing posture** (e.g., commercial license for InsightFace vs fully cloud API vs commercial SDK).
   * Determine **privacy/regulatory constraints** (e.g., whether faces can leave country/region) to narrow down between **self-hosted, big-cloud, or edge-first** patterns.


[1]: https://github.com/deepinsight/insightface?utm_source=chatgpt.com "deepinsight/insightface: State-of-the-art 2D and 3D Face ..."
[2]: https://www.researchgate.net/figure/Accuracy-on-the-LFW-dataset_tbl2_322568078?utm_source=chatgpt.com "Accuracy (%) on the LFW dataset. | Download Table"
[3]: https://github.com/IrvingMeng/MagFace?utm_source=chatgpt.com "MagFace: A Universal Representation for Face ..."
[4]: https://openaccess.thecvf.com/content/CVPR2022/papers/Kim_AdaFace_Quality_Adaptive_Margin_for_Face_Recognition_CVPR_2022_paper.pdf?utm_source=chatgpt.com "AdaFace: Quality Adaptive Margin for Face Recognition"
[5]: https://pmc.ncbi.nlm.nih.gov/articles/PMC8466208/?utm_source=chatgpt.com "Efficient Face Recognition System for Operating in ..."
[6]: https://github.com/serengil/retinaface?utm_source=chatgpt.com "serengil/retinaface - Deep Face Detection Library for Python"
[7]: https://www.datacamp.com/tutorial/amazon-rekognition?utm_source=chatgpt.com "Amazon Rekognition: Image and Video Analysis with AI"
[8]: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/face-api/?utm_source=chatgpt.com "Face API pricing"
[9]: https://www.idemia.com/insights/benchmarking-ensuring-accuracy-fairness-security-biometric-algorithms?utm_source=chatgpt.com "Benchmarking for Biometric technology: Accuracy, ..."
[10]: https://docs.cloud.google.com/vision/pricing?utm_source=chatgpt.com "Pricing | Cloud Vision API"
[11]: https://www.faceplusplus.com/v2/pricing/?utm_source=chatgpt.com "Pricing"
[12]: https://www.softwaresuggest.com/luxand-cloud?utm_source=chatgpt.com "Luxand.cloud - Pricing, Features, and Details in 2025"
[13]: https://www.kairos.com/pricing?utm_source=chatgpt.com "Pricing New"
[14]: https://softwarefinder.com/artificial-intelligence/skybiometry?utm_source=chatgpt.com "SkyBiometry: Pricing, Free Demo & Features"
[15]: https://www.edenai.co/post/best-face-recognition-apis?utm_source=chatgpt.com "Best Face Recognition APIs in 2025"
[16]: https://mediapipe.readthedocs.io/en/latest/solutions/face_detection.html?utm_source=chatgpt.com "MediaPipe Face Detection"
[17]: https://developers.google.com/ml-kit/vision/face-detection/ios?utm_source=chatgpt.com "Detect faces with ML Kit on iOS"
[18]: https://developer.apple.com/documentation/Vision/tracking-the-user-s-face-in-real-time?utm_source=chatgpt.com "Tracking the User's Face in Real Time"
[19]: https://github.com/shubham0204/OnDevice-Face-Recognition-Android?utm_source=chatgpt.com "shubham0204/OnDevice-Face-Recognition-Android"
[20]: https://docs.nvidia.com/maxine/ar/index.html?utm_source=chatgpt.com "NVIDIA Maxine Augmented Reality (AR) SDK User Guide"
[21]: https://www.luxand.com/?utm_source=chatgpt.com "Luxand - Face Recognition, Face Detection and Facial ..."
[22]: https://www.banuba.com/face-recognition-sdk?utm_source=chatgpt.com "Face Recognition SDK & API"
[23]: https://faceplugin.com/face-recognition/?utm_source=chatgpt.com "On-Premise Face Recognition SDK - FacePlugin"
[24]: https://www.insightface.ai/?utm_source=chatgpt.com "InsightFace: Open Source Deep Face Analysis Library - 2D&3D"
[25]: https://kby-ai.com/top-ranked-face-recognition/?utm_source=chatgpt.com "The Best Globally Top Ranked Face Recognition Algorithm ..."
[26]: https://instances.vantage.sh/aws/ec2/g4dn.xlarge?utm_source=chatgpt.com "g4dn.xlarge pricing and specs - Vantage"
[27]: https://aws.amazon.com/rekognition/faqs/?utm_source=chatgpt.com "Amazon Rekognition FAQs - AWS"
[28]: https://docs.cloud.google.com/vision/docs/detecting-faces?utm_source=chatgpt.com "Detect faces | Cloud Vision API"
[29]: https://www.economize.cloud/resources/aws/pricing/ec2/g4dn.xlarge/?utm_source=chatgpt.com "g4dn.xlarge pricing: $383.98 monthly - AWS EC2"
[30]: https://aws.amazon.com/rekognition/pricing/?utm_source=chatgpt.com "Amazon Rekognition pricing"
[31]: https://github.com/mk-minchul/AdaFace?utm_source=chatgpt.com "mk-minchul/AdaFace"
[32]: https://www.nec.com/en/press/202402/global_20240208_01.html?utm_source=chatgpt.com "NEC Face Recognition Technology Ranks First in NIST ..."
[33]: https://www.droidcon.com/2024/07/26/building-on-device-face-recognition-in-android/?utm_source=chatgpt.com "Building On-Device Face Recognition In Android"
[34]: https://developer.apple.com/documentation/Vision/analyzing-a-selfie-and-visualizing-its-content?utm_source=chatgpt.com "Analyzing a selfie and visualizing its content"
[35]: https://www.sciencedirect.com/science/article/abs/pii/S0031320324010872?utm_source=chatgpt.com "Deep face template protection in the wild"
