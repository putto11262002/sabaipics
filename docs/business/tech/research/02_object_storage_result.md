## 0. Modeling assumptions (for all cost estimates)

* Storage used (before 30-day cleanup):

  * Tier 1: **28 GB**, Tier 2: **278 GB**, Tier 3: **2.2 TB ≈ 2,200 GB**
* Egress per month:

  * Tier 1: **19 GB**, Tier 2: **277 GB**, Tier 3: **1,850 GB**
* Currency: **1 USD ≈ 31.96 THB**
* All prices are **approximate** public list prices as of 2024–2025. Real bills depend on exact region, discounts, and usage patterns.

---

## 1. Solutions found (by category)

### Major cloud providers

| Solution             | Category    | Asia region notes (relevant to Thailand)                                              |
| -------------------- | ----------- | ------------------------------------------------------------------------------------- |
| Amazon S3            | Major cloud | ap-southeast-7 (Bangkok), ap-southeast-1 (Singapore)([Amazon Web Services, Inc.][1])  |
| Google Cloud Storage | Major cloud | asia-southeast1 (Singapore), Thailand region announced for Bangkok([Google Cloud][2]) |
| Azure Blob Storage   | Major cloud | Southeast Asia (Singapore) region([azurespeed.com][3])                                |
| Alibaba Cloud OSS    | Major cloud | Multiple APAC regions (e.g. Singapore, Hong Kong)([AlibabaCloud][4])                  |

### Specialty / budget S3-compatible providers

| Solution            | Category                    | Asia-related notes                                                                                |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| Cloudflare R2       | Specialty (zero-egress)     | Global storage, data replicated; POPs close to Thailand via Cloudflare edge([Cloudflare Docs][5]) |
| Backblaze B2        | Budget / Bandwidth Alliance | Data centers in US & EU; no APAC region but global access([backblaze.com][6])                     |
| Wasabi Hot Cloud    | Budget / flat-rate          | APAC region incl. Singapore; no egress or API fees([wasabi.com][7])                               |
| DigitalOcean Spaces | Dev-focused                 | S3-compatible object storage; Singapore region available([DigitalOcean][8])                       |

### Self-hosted / self-managed

| Solution  | Category       | Notes                                                                                                               |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| MinIO     | Self-hosted S3 | High-performance S3-compatible object store; supports lifecycle, multipart, S3-style presigned URLs([bunny.net][9]) |
| Ceph RGW  | Self-hosted S3 | Ceph RADOS Gateway implements S3-compatible API([wasabi-cloud.in.th][10])                                           |
| SeaweedFS | Self-hosted S3 | Distributed object/file store with S3-compatible API([backblaze.com][11])                                           |

---

## 2. Cost comparison snapshot (modeled with your tiers)

> All figures are **approximate** monthly costs (USD) = storage + egress only, assuming no sustained-use discounts, no enterprise contracts, no CDN optimizations, no free tiers used.

| Provider                               | Tier 1 (Early) | Tier 2 (Growing) | Tier 3 (Scale) |
| -------------------------------------- | -------------- | ---------------- | -------------- |
| **AWS S3 (APAC)**                      | **$2.41 (฿77)** | **$31.88 (฿1,019)** | **$221.50 (฿7,078)** |
| **Google Cloud Storage (Standard)**    | $2.84 (฿91) | $38.80 (฿1,240) | $266.00 (฿8,502) |
| **Azure Blob (Hot)**                   | $2.16 (฿69) | $28.55 (฿913) | $198.60 (฿6,351) |
| **Alibaba Cloud OSS (Standard)**       | $1.93 (฿62) | $25.86 (฿827) | $178.66 (฿5,709) |
| **Cloudflare R2 (no egress fees)**     | **$0.42 (฿13)** | **$4.17 (฿133)** | **$33.00 (฿1,055)** |
| **Backblaze B2 (<=3× storage egress)** | **$0.14 (฿4)** | **$1.39 (฿44)** | **$11.00 (฿352)** |
| **Wasabi (PAYG, 90-day + 1 TB min)**   | $6.99 (฿224) | $6.99 (฿224) | $44.88 (฿1,434) |
| **DigitalOcean Spaces**                | $5.00 (฿160) | $5.56 (฿178) | $52.26 (฿1,670) |

* Rough THB conversion (×31.96):

  * **AWS S3 Tier 3:** ≈ **7,079 THB**; **Cloudflare R2 Tier 3:** ≈ **1,055 THB**; **Backblaze B2 Tier 3:** ≈ **352 THB**.
* These figures ignore request costs (which are small at your scale) and **ignore** data-transfer discounts via CDNs or Bandwidth Alliance, which can materially change the economics.

---

## 3. Major clouds – detailed notes

### 3.1 Amazon S3

**Cost model (APAC high-level):**

* Standard storage (APAC) ≈ **$0.025/GB-month** for first 50 TB (slightly higher than US regions)([Wise][12])
* Data transfer out to internet: commonly **$0.09/GB** for first 10 TB/month([Cloudflare][13])
* Requests (S3 Standard): **PUT/COPY/POST/LIST ≈ $0.005 per 1,000**, **GET ≈ $0.0004 per 1,000**([Amazon Web Services, Inc.][14])
* At your modeled tiers, requests are likely a **small fraction** of storage+egress unless you do extreme hotlinking/gallery refreshes.

**Technical fit:**

* **S3 API:** Native.
* **Asia regions:** Includes **ap-southeast-7 (Bangkok)** and **ap-southeast-1 (Singapore)** among others([Amazon Web Services, Inc.][1]) – good latency to Thai users.
* **Multipart upload:** Fully supported; widely optimized in SDKs.
* **Presigned URLs:** First-class via AWS SDKs (Query String Authentication).([Medium][15])
* **Lifecycle policies:** S3 Lifecycle supports “Expire objects after N days”; 30-day auto-delete is straightforward.([AWS Documentation][16])

**Operational & integration points:**

* SLA: S3 Standard SLA is **99.9% availability**; designed durability 11 nines([Amazon Web Services, Inc.][17]).
* **Face AI colocation:** If AI runs on AWS (EC2, Lambda, Bedrock) in the same region, **S3 ↔ compute traffic is free or very cheap**; S3→CloudFront origin traffic is $0/GB.([Amazon Web Services, Inc.][18])
* **CDN:** Native CloudFront; you still pay CDN egress to internet (e.g., APAC ~ $0.12/GB)([CloudZero][19]), but origin egress from S3 to CloudFront is free. Good for caching processed images and thumbnails.
* **Dev velocity:** Strong tooling, SDKs, presigned flows for direct browser / desktop uploads.

### 3.2 Google Cloud Storage (GCS)

**Cost model (asia-southeast1/nearby):**

* Standard storage in a regional bucket: published examples show **~$0.02/GB-month**.([Google Cloud][2])
* Network egress: recent sources show **~$0.12/GB** to internet as a typical rate.([Google Cloud Documentation][20])
* Operations: Class A/B operations priced by million; typically low vs storage+egress at your volumes.([NetApp][21])

**Technical fit:**

* **API:** Not S3; native JSON/XML API. However, S3-compatible layers exist in the ecosystem (not official).
* **Asia regions:** **asia-southeast1 (Singapore)**, and a **Thailand region (Bangkok)** announced; Google has publicly committed to a Thai region for low-latency workloads.([Google Cloud][2])
* **Multipart:** Parallel composite uploads and “resumable uploads” equivalents.
* **Presigned URLs:** Supported via “signed URLs” (V4) for direct upload/download.([Medium][15])
* **Lifecycle:** Object Lifecycle Management supports rules like “Delete after age ≥ 30 days”.([Google Cloud Documentation][22])

**Operational & integration points:**

* SLA: GCS Standard offers **≥99.9% availability** depending on region and redundancy.([Google Cloud][23])
* **Face AI colocation:** If you run Vertex AI / custom models in the same region, intra-region traffic is cheaper or free in many paths.([Google Cloud][24])
* **CDN:** Cloud CDN waives Cloud Storage data transfer charges when used as origin; you pay CDN egress instead.([Google Cloud][25])

Note: **GCS is not S3-compatible**; adopting it means either using separate SDKs or a gateway layer.

### 3.3 Azure Blob Storage

**Cost model (Southeast Asia, Hot + LRS ballpark):**

* Hot LRS storage commonly quoted around **$0.018–$0.023/GB-month** in Southeast Asia; many references use **$0.023/GB** as comparable to S3.([cloudchipr.com][26])
* Egress: typical internet data out pricing for Asia around **$0.08/GB** in public examples.([CloudMonitor][27])

**Technical fit:**

* **API:** Native Azure Blob APIs (not S3), but third-party S3 wrappers exist.
* **Asia region:** “Southeast Asia” region serves APAC from Singapore.([azurespeed.com][3])
* **Multipart:** Block blob upload (blocks + commit) equivalent.
* **Presigned URLs:** Achieved via **SAS (Shared Access Signatures)**; conceptually the same as presigned URLs.([Microsoft Learn][28])
* **Lifecycle:** Blob lifecycle management supports delete-by-age rules.([Microsoft Learn][29])

**Operational & integration points:**

* SLA: Azure Storage SLA states **99.9%+ availability** for single-region LRS blobs.([Microsoft Learn][30])
* Tight integration with Azure Functions, App Service, Event Grid for event-driven processing pipeline.

### 3.4 Alibaba Cloud OSS

**Cost model (Standard, APAC):**

* Standard storage in APAC regions like Singapore is around **$0.017–$0.018/GB-month**([AlibabaCloud][4]) – cheaper than US hyperscaler regions in many comparisons.
* Egress: published examples list outbound internet data in APAC at around **$0.076/GB** for low-volume tiers.([AlibabaCloud][31])

**Technical fit:**

* **S3 API:** OSS provides an **S3-compatible API in addition to its native API**, often used for migration from S3.([AlibabaCloud][32])
* **Asia regions:** Several APAC regions (Singapore, Hong Kong, Jakarta, etc.) suitable for Thailand latency.([AlibabaCloud][4])
* **Multipart upload:** Supported.
* **Presigned URLs:** Supported via “signed URL” mechanism over S3-compatible or native API.([AlibabaCloud][33])
* **Lifecycle:** OSS lifecycle rules can delete objects after an age threshold (e.g., 30 days).([AlibabaCloud][34])

**Operational & integration points:**

* SLA: OSS standard storage offers availability in the 99.9–99.99% range depending on redundancy level.([AlibabaCloud][35])
* OSS is also part of the **Cloudflare Bandwidth Alliance** (potential combined cost optimizations).([The Cloudflare Blog][36])

---

## 4. Specialty / budget providers

### 4.1 Cloudflare R2

**Cost model:**

* Storage: **$0.015/GB-month (Standard)**.([Cloudflare Docs][5])
* **Egress:** **$0/GB to the internet** – no egress fees.([Cloudflare Docs][5])
* Operations: Class A (write) **$4.50/million**, Class B (read) **$0.36/million**.([Cloudflare Docs][5])

**Technical fit:**

* **S3 API:** R2 exposes an **S3-compatible API**, including multipart and presigned URLs.([Cloudflare Docs][37])
* **Regions:** R2 is location-transparent; objects are stored in Cloudflare’s network with data locality controls; users hit nearest edge POPs.([Cloudflare][38])
* **Lifecycle:** Object lifecycle rules support delete-after-N-days, including 30-day TTL.([Cloudflare Docs][39])

**Operational & integration points:**

* SLA: R2 offers an availability SLA of **99.9%**.([Cloudflare Docs][40])
* **CDN:** Tight integration with Cloudflare CDN; R2 → CDN egress is free since egress is globally free.
* Strong fit for **image distribution** (processed + thumbnails) where egress, not storage, dominates over time.

### 4.2 Backblaze B2

**Cost model (Standard B2):**

* Storage: **$0.005/GB-month**.([backblaze.com][41])
* Egress pricing: **Free up to 3× average monthly storage**, then **$0.01/GB** beyond that; plus **free egress to Cloudflare, bunny.net, Fastly, etc.** via Bandwidth Alliance.([backblaze.com][41])
* At your tiers, egress is **< 3× storage** in all three tiers, so modeled egress cost is effectively **$0**.

**Technical fit:**

* **S3 API:** B2 has a robust **S3-compatible API** with multipart upload and presigned URL support.([backblaze.com][11])
* **Regions:** Data centers in US and Europe only; users in Thailand will see higher latency compared with Singapore/Bangkok storage.([backblaze.com][6])
* **Lifecycle:** B2 lifecycle rules can delete (or hide) older versions after a number of days.([backblaze.com][42])

**Operational & integration points:**

* SLA: B2 is marketed with durability comparable to hyperscalers; explicit SLA language focuses on 99.9%+ availability.([backblaze.com][43])
* **CDN:** Very strong fit with Cloudflare or other Bandwidth Alliance CDNs: origin egress **free**.([backblaze.com][44])

### 4.3 Wasabi Hot Cloud Storage

**Cost model (Pay-as-You-Go, APAC):**

* Sticker price: **$6.99/TB-month = $0.0068/GB-month**; **no egress or API request charges**.([wasabi.com][45])
* Important policies:

  * **90-day minimum storage duration** for Pay-as-you-go: delete earlier, still billed as if stored 90 days.([docs.wasabi.com][46])
  * **1 TB minimum monthly billable storage** for PAYG accounts.([docs.wasabi.com][47])
* With your **30-day retention**, the 90-day min effectively **triples the monthly storage cost per GB**, and the 1 TB minimum dominates early tiers.

**Technical fit:**

* **S3 API:** Fully S3-compatible.([wasabi.com][7])
* **Presigned URLs:** Supported (S3-compatible libraries and docs show presigned URL usage).([docs.wasabi.com][48])
* **Lifecycle:** Lifecycle policies & delete markers supported; can auto-delete objects based on age, but **billing still respects 90-day min**.([docs.wasabi.com][49])
* APAC region (e.g., Singapore) available.

**Operational & integration points:**

* Wasabi participates in **Cloudflare Bandwidth Alliance** (free or discounted egress to Cloudflare).([Cloudflare][50])
* For workloads with **short retention (30 days)**, minimum duration/mimimum capacity policies are a major factor to examine.

### 4.4 DigitalOcean Spaces

**Cost model (per Space):**

* Flat **$5/month** includes **250 GiB storage + 1 TiB outbound transfer**.
* Additional: **$0.02/GB-month** storage and **$0.01/GB** egress above included quotas.([DigitalOcean][8])

Given your tiers:

* Tier 1: fits fully in included 250 GB & 1 TB → **$5**.
* Tier 2: slight storage overage: **$5.56**.
* Tier 3: storage + egress overages → **~$52.26**.

**Technical fit:**

* **S3-compatible** (Spaces API is explicitly S3-compatible).([docs.digitalocean.com][51])
* **Multipart upload:** Supported.([docs.digitalocean.com][52])
* **Presigned URLs:** Supported with SigV2 and SigV4; DO docs explicitly mention presigned URLs.([docs.digitalocean.com][51])
* **Lifecycle:** Lifecycle rules (including “expire after 30 days”) configurable via s3cmd/CLI.([docs.digitalocean.com][53])
* **Region:** Singapore datacenter for low latency to Thailand.

**Operational & integration points:**

* SLA: Spaces inherits DigitalOcean’s general availability commitments; historically good but not at hyperscaler scale.
* Built-in CDN option, but presigned URLs are not cache-friendly for DO’s own CDN in some flows.([docs.digitalocean.com][54])

---

## 5. Self-hosted S3-compatible options

> Costs here depend entirely on underlying compute, storage hardware, and networking. Key inputs: server rental/colo costs in Thailand/Singapore, bandwidth pricing, ops headcount.

### 5.1 MinIO

* **What it is:** High-performance, Kubernetes-friendly, S3-compatible object storage designed for private clouds/on-prem.([bunny.net][9])
* **Technical:**

  * Full S3 API, multipart upload, presigned URLs via S3 SDKs.
  * Lifecycle policies (expire objects after N days) and tiering supported.([AIStor Object Store Documentation][55])
* **Operational:**

  * Requires running your own cluster (Kubernetes or bare metal) with erasure-coded disks, monitoring, backups.
  * You take the responsibility for durability & availability; MinIO itself targets “hyperscaler-class” performance, but SLA is determined by your infra.

### 5.2 Ceph (RGW)

* **What it is:** General-purpose distributed storage; Ceph’s **RADOS Gateway** implements S3-compatible object storage.([wasabi-cloud.in.th][10])
* **Technical:**

  * S3 API, multipart, presigned flows via S3 SDKs.
  * Lifecycle rules available, but configuration is more complex vs MinIO.
* **Operational:**

  * Larger operational footprint: OSDs, monitors, RGW gateways, etc.
  * Offers block+file as well, which can be overkill if you only need object storage.

### 5.3 SeaweedFS

* **What it is:** Distributed storage system with S3-compatible API layer.([backblaze.com][11])
* **Technical:**

  * Focus on high-throughput workloads; can store image assets with erasure coding and volume servers.
  * S3 API support exists but with less ecosystem maturity than S3/MinIO/Ceph.
* **Operational:**

  * Similar self-hosting complexity: cluster management, scaling, backup, monitoring.

**Self-hosted key observation:**
For your **relatively modest TB-scale** and strong emphasis on **fast time-to-market**, infra cost + SRE time + bandwidth contracts often dominate raw disk cost. Self-host may become attractive when you control Thai data centers and operate at significantly larger scale or have regulatory drivers.

---

## 6. Capability matrix vs your requirements

### 6.1 API & core feature fit

| Provider                 | S3-compatible API | Multipart upload | Presigned URLs / Signed URLs                   | Lifecycle (30-day delete)                                                    |
| ------------------------ | ----------------- | ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| AWS S3                   | Native            | Yes              | Yes                                            | Yes([AWS Documentation][16])                                                 |
| GCS                      | No (native API)   | Yes (resumable)  | Yes (Signed URLs)([Medium][15])                | Yes([Google Cloud Documentation][22])                                        |
| Azure Blob               | No S3, native     | Yes              | SAS tokens (equivalent)([Microsoft Learn][28]) | Yes([Microsoft Learn][29])                                                   |
| Alibaba OSS              | Yes (plus native) | Yes              | Yes (signed URLs)([AlibabaCloud][32])          | Yes([AlibabaCloud][34])                                                      |
| Cloudflare R2            | Yes               | Yes              | Yes                                            | Yes([Cloudflare Docs][5])                                                    |
| Backblaze B2             | Yes               | Yes              | Yes([backblaze.com][11])                       | Yes (lifecycle rules)([backblaze.com][42])                                   |
| Wasabi                   | Yes               | Yes              | Yes([docs.wasabi.com][48])                     | Yes (lifecycle), but 90-day billing min still applies([docs.wasabi.com][49]) |
| DO Spaces                | Yes               | Yes              | Yes([docs.digitalocean.com][51])               | Yes (via s3cmd lifecycle)([docs.digitalocean.com][53])                       |
| MinIO / Ceph / SeaweedFS | Yes               | Yes              | Yes (via S3 SDKs)                              | Yes (policy-based)([AIStor Object Store Documentation][55])                  |

---

## 7. Integration considerations by component

### 7.1 Face AI (image processing / recognition)

* **Same-cloud, same-region** minimizes both **latency** and **internal transfer cost**:

  * S3 + AWS compute (EC2/Lambda/Fargate/Bedrock) in Bangkok/Singapore: intra-region traffic typically free.([Cloudflare][13])
  * GCS + GCE/Vertex AI in the same region: network pricing favors intra-region; Cloud Storage ↔ compute often discounted/free.([Google Cloud][24])
* If Face AI is external (e.g., third-party API), object storage choice mainly affects **egress cost** for sending originals and processed images to that service.

### 7.2 CDN

* **AWS S3 + CloudFront:**

  * S3 → CloudFront egress **$0/GB**; CloudFront → users billed (APAC ≈ $0.12/GB for low volumes).([Amazon Web Services, Inc.][18])
* **GCS + Cloud CDN:**

  * GCS → Cloud CDN egress charges **waived**; pay Cloud CDN egress instead.([Google Cloud][25])
* **Backblaze B2 / Wasabi + Cloudflare:**

  * Via **Bandwidth Alliance**, B2 and Wasabi offer **free or discounted origin egress** to Cloudflare CDN.([backblaze.com][44])
* **Cloudflare R2:**

  * No egress fees at all; serving directly or via Workers + CDN keeps transfer costs at zero for the storage side.([Cloudflare Docs][5])

### 7.3 Image pipeline & desktop app (presigned upload)

For your **camera → desktop app → storage** and **web viewer** flows:

* All S3-compatible options (AWS, R2, B2, Wasabi, DO Spaces, OSS, self-hosted) support **standard S3 presigned URL patterns** for direct upload/download.([backblaze.com][11])
* GCS and Azure use **signed URLs / SAS tokens**, conceptually equivalent and supported in official SDKs.([Microsoft Learn][28])
* Desktop app integration will be simplest with a provider where:

  * SDKs exist in your app’s stack.
  * Latency from Thailand to storage region is low (Bangkok/Singapore).

### 7.4 API backend

* All providers allow the pattern: **backend generates presigned URL → client uploads/downloads directly**, keeping the backend out of the hot data path.
* Consider rate limits on presigned URL generation (usually generous; practically not an issue for your scale).

---

## 8. Notable “gotchas” discovered

These are **non-obvious findings** that significantly influence design:

1. **Wasabi & 30-day retention:**

   * 90-day minimum storage duration + 1 TB minimum monthly bill substantially raises effective cost with 30-day auto-delete and sub-TB usage.([docs.wasabi.com][46])

2. **Location vs cost trade-off for B2 and R2:**

   * Backblaze B2 is extremely cheap with Bandwidth Alliance and 3× free egress, but geographically **far from Thailand** (US/EU data centers).([backblaze.com][6])
   * Cloudflare R2 has zero egress and a strong global network, but object residency and compliance need to be validated if you require strict data-locality in Thailand.([Cloudflare Docs][5])

3. **GCS/Azure are not S3-native:**

   * You gain regional options and first-party AI/CDN integrations, but you **lose direct S3 compatibility** and need separate code paths or gateways.

4. **Lifecycle ≠ billing retention:**

   * For all providers with minimum duration policies (Wasabi, some cold tiers elsewhere), “delete after 30 days” from a lifecycle rule **does not guarantee** you only pay for 30 days of storage.

---

## 9. Example next-step questions (for narrowing choice)

To move from “discovery” to a short-list, information that would materially affect direction:

1. **Latency tolerance:**

   * Is sub-100 ms latency for image listing/viewing from Thailand mandatory, or is 150–200 ms acceptable? (This affects whether non-APAC regions like B2 are viable.)

2. **Face AI hosting location:**

   * Will Face AI run inside AWS, GCP, Azure, another cloud, or a separate provider?
   * Do you expect heavy back-and-forth of originals between storage and AI?

3. **Traffic shape:**

   * Ratio of **thumbnail vs processed vs original** downloads.
   * Expected read amplification (e.g., average views per photo over 30 days).

4. **Compliance / PDPA considerations:**

   * Any requirement that **data remain in Thailand** vs “nearby APAC region is fine”?

5. **Operational appetite:**

   * Do you have capacity to operate self-hosted storage or do you prefer fully managed?

---

## 10. Summary of current research coverage

* Covered **4 major clouds**, **4 specialty/budget S3-compatible providers**, and **3 self-hosted options**, all checked against:

  * S3-compatibility, presigned URLs, lifecycle policies, multipart upload, Asia-region presence, and high-level SLAs.
* Built a **unified cost model** for your Tier 1/2/3 scales, using current public list pricing sources for storage and egress, and highlighted where request or policy effects (e.g., Wasabi) materially change outcomes.
* Identified **integration considerations** with Face AI, CDN, image pipeline, and desktop app for each category.

[1]: https://aws.amazon.com/th/blogs/thailand/category/regions/?utm_source=chatgpt.com "Regions | AWS Thai Blog"
[2]: https://cloud.google.com/storage/pricing "Storage pricing | Google Cloud"
[3]: https://www.azurespeed.com/Information/AzureRegions/SoutheastAsia?utm_source=chatgpt.com "Southeast Asia - Azure Region"
[4]: https://www.alibabacloud.com/help/en/oss/developer-reference/lifecycle?utm_source=chatgpt.com "Object Storage Service:lifecycle"
[5]: https://developers.cloudflare.com/r2/pricing/?utm_source=chatgpt.com "R2 pricing"
[6]: https://www.backblaze.com/docs/cloud-storage-data-regions?utm_source=chatgpt.com "Guide to Backblaze Cloud Storage Data Centers"
[7]: https://wasabi.com/pricing?utm_source=chatgpt.com "Wasabi Hot Cloud Storage Pricing"
[8]: https://www.digitalocean.com/pricing/spaces-object-storage?utm_source=chatgpt.com "Spaces Object Storage Pricing"
[9]: https://bunny.net/blog/whats-happening-with-s3-compatibility/?utm_source=chatgpt.com "Bunny Storage S3 Compatibility: Updates and Roadmap"
[10]: https://wasabi-cloud.in.th/wasabi-s3-storage/?utm_source=chatgpt.com "Wasabi S3 Storage -"
[11]: https://www.backblaze.com/docs/cloud-storage-s3-compatible-api?utm_source=chatgpt.com "S3-Compatible API"
[12]: https://wise.com/sg/blog/aws-vs-azure?utm_source=chatgpt.com "AWS vs Azure: Which is Best in 2025?"
[13]: https://www.cloudflare.com/learning/cloud/what-is-aws-data-transfer-pricing/?utm_source=chatgpt.com "What is AWS data transfer pricing? | AWS bandwidth pricing"
[14]: https://aws.amazon.com/th/s3/pricing/?utm_source=chatgpt.com "ราคา Amazon S3 - พื้นที่จัดเก็บอ็อบเจ็กต์บนคลาวด์"
[15]: https://medium.com/%40shaikhsarwan49/signed-urls-in-aws-gcp-and-azure-a-beginner-friendly-guide-e2e549425865?utm_source=chatgpt.com "Signed URLs in AWS, GCP, and Azure: A Beginner- ..."
[16]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html?utm_source=chatgpt.com "Expiring objects - Amazon Simple Storage Service"
[17]: https://aws.amazon.com/s3/sla/?utm_source=chatgpt.com "Amazon S3 Service Level Agreement"
[18]: https://aws.amazon.com/cloudfront/pricing/?utm_source=chatgpt.com "Amazon CloudFront CDN - Plans & Pricing - Try For Free"
[19]: https://www.cloudzero.com/blog/cloudfront-pricing/?utm_source=chatgpt.com "CloudFront Pricing: How To Manage And Optimize Your ..."
[20]: https://docs.cloud.google.com/storage/pricing-examples?utm_source=chatgpt.com "Pricing examples"
[21]: https://www.netapp.com/blog/gcp-cvo-blg-google-cloud-storage-pricing-get-the-best-bang-for-your-buckets/?utm_source=chatgpt.com "Google Cloud Storage Pricing: Get the Best Bang for Your ..."
[22]: https://docs.cloud.google.com/storage/docs/managing-lifecycles?utm_source=chatgpt.com "Manage object lifecycles | Cloud Storage"
[23]: https://cloud.google.com/storage/sla?utm_source=chatgpt.com "Cloud Storage Service Level Agreement (SLA)"
[24]: https://cloud.google.com/vpc/network-pricing?utm_source=chatgpt.com "Network pricing"
[25]: https://cloud.google.com/storage/pricing?utm_source=chatgpt.com "Storage pricing"
[26]: https://cloudchipr.com/blog/azure-blob-storage-pricing?utm_source=chatgpt.com "Azure Blob Storage Pricing Breakdown: What You Need to ..."
[27]: https://cloudmonitor.ai/2021/08/azure-data-transfer-costs-everything-you-need-to-know/?utm_source=chatgpt.com "Azure Data Transfer Costs: Everything You Need To Know"
[28]: https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview?utm_source=chatgpt.com "Grant limited access to data with shared access signatures ..."
[29]: https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-delete?utm_source=chatgpt.com "Lifecycle management policies that delete blobs - Azure ..."
[30]: https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview?utm_source=chatgpt.com "Access tiers for blob data - Azure Storage"
[31]: https://www.alibabacloud.com/en/product/oss-pricing-list/en?_p_lc=1&utm_source=chatgpt.com "OSS Price details"
[32]: https://www.alibabacloud.com/help/en/oss/developer-reference/compatibility-with-amazon-s3?utm_source=chatgpt.com "Object Storage Service:S3 APIs compatible with OSS and ..."
[33]: https://www.alibabacloud.com/help/en/oss/developer-reference/use-aws-sdks-to-access-oss?utm_source=chatgpt.com "Object Storage Service:Access OSS using AWS SDKs"
[34]: https://www.alibabacloud.com/help/en/oss/user-guide/overview-54/?utm_source=chatgpt.com "What is OSS Lifecycle - Object Storage Service"
[35]: https://www.alibabacloud.com/blog/alibaba-cloud-announces-new-sla-for-oss-up-to-99-995%25-for-cross-zone-redundancy_596363?utm_source=chatgpt.com "Alibaba Cloud Announces New SLA for OSS, up to 99.995 ..."
[36]: https://blog.cloudflare.com/aws-egregious-egress/?utm_source=chatgpt.com "AWS's Egregious Egress"
[37]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/?utm_source=chatgpt.com "Presigned URLs · Cloudflare R2 docs"
[38]: https://www.cloudflare.com/developer-platform/products/r2/?utm_source=chatgpt.com "Cloudflare R2 | Zero Egress Fee Object Storage"
[39]: https://developers.cloudflare.com/r2/buckets/object-lifecycles/?utm_source=chatgpt.com "Object lifecycles · Cloudflare R2 docs"
[40]: https://developers.cloudflare.com/r2/reference/durability/?utm_source=chatgpt.com "Durability - R2"
[41]: https://www.backblaze.com/blog/transparency-in-cloud-storage-costs/?utm_source=chatgpt.com "Transparency in Cloud Storage Costs: Still Elusive"
[42]: https://www.backblaze.com/docs/cloud-storage-configure-and-manage-lifecycle-rules?utm_source=chatgpt.com "Configure and Manage Lifecycle Rules"
[43]: https://www.backblaze.com/cloud-storage?utm_source=chatgpt.com "Low Cost, High Performance S3 Compatible Object Storage"
[44]: https://www.backblaze.com/docs/cloud-storage-cloudflare-integrations?utm_source=chatgpt.com "Cloudflare Integrations"
[45]: https://wasabi.com/pricing/faq?utm_source=chatgpt.com "Pricing FAQs for Wasabi's Pay as You Go Pricing Model"
[46]: https://docs.wasabi.com/docs/how-does-wasabis-minimum-storage-duration-policy-work?utm_source=chatgpt.com "Minimum Storage Duration Policy"
[47]: https://docs.wasabi.com/docs/how-does-wasabis-monthly-minimum-storage-charge-work?utm_source=chatgpt.com "Monthly Minimum Storage Charge"
[48]: https://docs.wasabi.com/docs/how-do-i-generate-pre-signed-urls-for-temporary-access-with-wasabi?utm_source=chatgpt.com "How do I generate pre-signed URLs for temporary access ..."
[49]: https://docs.wasabi.com/docs/lifecycle?utm_source=chatgpt.com "Lifecycle Settings: Creating a Rule"
[50]: https://www.cloudflare.com/bandwidth-alliance/?utm_source=chatgpt.com "Bandwidth Alliance | Reduce Data Transfer Fees"
[51]: https://docs.digitalocean.com/products/spaces/how-to/set-file-permissions/?utm_source=chatgpt.com "How to Share Links to Files with File Permissions and ..."
[52]: https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/?utm_source=chatgpt.com "Spaces S3 Compatibility"
[53]: https://docs.digitalocean.com/products/spaces/how-to/configure-lifecycle-rules/?utm_source=chatgpt.com "How to Configure Lifecycle Rules"
[54]: https://docs.digitalocean.com/products/spaces/how-to/use-aws-sdks/?utm_source=chatgpt.com "How to Use DigitalOcean Spaces with AWS S3 SDKs"
[55]: https://docs.min.io/enterprise/aistor-object-store/administration/object-lifecycle-management/?utm_source=chatgpt.com "Object Lifecycle Management"
