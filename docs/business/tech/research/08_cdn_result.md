## 1. Research plan & scope

**Goal:** Map the CDN option space (general-purpose + image-focused) for an event-photo platform with Thailand/Asia users, spiky traffic, and egress-dominated cost.
**Focus dimensions:**

* Egress cost (Asia/Thailand)
* Thailand/Asia PoPs & latency
* Cache control + invalidation APIs (30-day delete window)
* Image optimization (URL transforms / resizing)
* Integration with object storage, esp. combos with reduced/zero egress

---

## 2. Shortlist of solutions

### General-purpose CDNs

| ID | CDN                   | Category    | Notes (high level)                                                                                                          |
| -- | --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| A  | **Cloudflare CDN**    | General CDN | Global network 330+ PoPs; Bangkok + other Thai cities; plan-based pricing (no per-GB bandwidth line item) ([Cloudflare][1]) |
| B  | **Amazon CloudFront** | General CDN | Deep AWS integration; Asia Pacific data transfer ~$0.02/GB; 1 TB/mo free tier ([Elite Cloud |][2])                          |
| C  | **Google Cloud CDN**  | General CDN | Runs on Google edge; edge PoP in Bangkok and many APAC cities ([Google Cloud Documentation][3])                             |
| D  | **bunny.net CDN**     | General CDN | Explicit low pricing; APAC rate $0.03/GB; Bangkok PoP; Asia-focused marketing ([bunny.net][4])                              |
| E  | **Fastly**            | General CDN | Developer-centric; APAC ~$0.19/GB (higher cost) ([Fastly][5])                                                               |

### Image-specific services (CDN + processing)

| ID | Service                                  | Category        | Notes (high level)                                                                                                 |
| -- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| F  | **Cloudinary**                           | Image CDN / DAM | Credit-based (225 credits for $89 “Plus”); dynamic URL transforms; uses multi-CDN under the hood ([Cloudinary][6]) |
| G  | **ImageKit.io**                          | Image CDN       | Built-in CloudFront CDN; 225 GB bandwidth for $89 Pro; easy S3/GCS/Azure integration ([ImageKit][7])               |
| H  | **imgix**                                | Image CDN       | Real-time image processing; credit-based bundles (e.g. $75 for up to 250 GB delivery) ([docs.imgix.com][8])        |
| I  | **Cloudflare Images (+ Image Resizing)** | Image CDN       | Per-image pricing ($5/100k stored, $1/100k delivered); resizing via `/cdn-cgi/image` URLs ([Cloudflare Docs][9])   |

Additionally, CDN + storage combos with **discounted/zero egress** (strong coupling between storage & CDN):

* **Cloudflare R2 + Cloudflare CDN** – R2 advertises *no egress fees* for any storage class ([Cloudflare Docs][10])
* **Backblaze B2 + Cloudflare / bunny / Fastly** – free egress from B2 to these CDN partners via Bandwidth Alliance ([backblaze.com][11])
* **Wasabi + Cloudflare** – Wasabi advertises no egress or API fees; free transfer to Cloudflare for shared customers ([Cloudflare][12])

---

## 3. Cost comparison (bandwidth only, APAC, approximate)

Assumptions:

* Traffic primarily served from APAC PoPs (Thailand + regional).
* Ignore request charges (they are much smaller than bandwidth at these GB/TB volumes, unless images are extremely tiny).
* 1 USD = 31.96 THB (given).
* CloudFront + Cloud CDN: use representative ~$0.02/GB APAC rate from recent regional analysis; exact AWS/GCP price tables are more granular and should be checked in calculators. ([Elite Cloud |][2])
* bunny: official Standard network pricing for Asia & Oceania. ([bunny.net][4])
* Fastly: official public APAC “first 10 TB” price. ([Fastly][5])

### 3.1 General-purpose CDN egress costs (approx.)

*Egress only, not including any fixed plan charges, storage, or image-processing add-ons.*

| CDN (APAC)                                   | Price model (assumed)                                                                                                                                                                                         | Tier 1 (~19 GB)                   | Tier 2 (~277 GB)    | Tier 3 (~1.85 TB ≈ 1850 GB) | Notes                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare CDN**                           | **Plan-based, not per-GB** – Free & Pro plans include "unmetered" bandwidth within ToS; no published per-GB rate. ([Cloudflare][13])                                                                          | ~$0 bandwidth; plan $0–$25/mo (฿0–799) | same                | same                        | Actual incremental egress is $0; cost is dominated by plan choice (Free vs Pro $20–25/mo ≈฿640–799, Business $200/mo ≈฿6,392). ([Cloudflare][14]) |
| **Amazon CloudFront**                        | ~**$0.02/GB** (฿0.64/GB) data transfer out in Asia Pacific (recent vendor estimate; official table is region-specific). ([Elite Cloud |][2])                                                                   | **$0.38 (฿12)** | **$5.54 (฿177)** | **$37.00 (฿1,183)** | 1 TB/mo free tier for first year would fully cover T1 & T2 and ~54% of T3 in year 1. ([Elite Cloud |][2])                       |
| **Google Cloud CDN**                         | Use **$0.02/GB** (฿0.64/GB) effective for cache-served APAC traffic as a representative value (cache-fill + egress), based on public analyses; official pricing is split across SKUs. ([Google Cloud Documentation][15]) | **$0.38 (฿12)** | **$5.54 (฿177)** | **$37.00 (฿1,183)** | Exact cost depends on cache hit ratio and interplay with general GCP network egress SKUs.                                       |
| **bunny.net CDN (Standard, Asia & Oceania)** | **$0.03/GB** (฿0.96/GB) in Asia & Oceania, $1/mo (฿32/mo) minimum bill. ([bunny.net][4])                                                                                                                   | **$0.57 → billed as $1.00 (฿32)** | **$8.31 (฿266)** | **$55.50 (฿1,774)** | No separate request charges; regional pricing is very simple.                                                                   |
| **Fastly**                                   | **$0.19/GB** (฿6.07/GB) in Asia for first 10 TB. ([Fastly][5])                                                                                                                                                | **$3.61 (฿115)** | **$52.63 (฿1,682)** | **$351.50 (฿11,234)** | Significantly higher APAC egress price at these volumes; good as "upper bound" reference.                                       |

### 3.2 DO Spaces + built-in CDN (for context)

DigitalOcean Spaces includes 250 GB storage + **1,024 GiB outbound transfer** (≈1 TB) from Spaces/CDN for **$5/mo (฿160)**, additional outbound transfer **$0.01/GiB (฿0.32/GiB)**. ([docs.digitalocean.com][16])

Approx. cost (traffic only, ignoring storage value):

| Tier                     | Included vs overage                             | Approx. monthly   |
| ------------------------ | ----------------------------------------------- | ----------------- |
| T1 (19 GB)               | < 1 TB → within included transfer               | **$5.00 (฿160)**  |
| T2 (277 GB)              | < 1 TB → within included transfer               | **$5.00 (฿160)**  |
| T3 (1.85 TB ≈ 1,723 GiB) | ~1,024 GiB free + ~699 GiB overage × $0.01 ≈ $7 | **$11.99 (฿383)** |

Note: this “CDN+storage bundle” is structurally different from pure CDNs; included storage value is not broken out here.

---

## 4. Technical profile per solution

### A. Cloudflare CDN

**PoPs / coverage**

* Global network with **330+ locations**; Thailand coverage includes **Bangkok, Chiang Mai, Surat Thani** according to third-party PoP mapping. ([Cloudflare][1])

**Cache control & invalidation**

* Respects standard `Cache-Control` / `Expires` headers; additional control via page/cache rules.
* Invalidation:

  * Purge by **URL**, **prefix**, **host**, or **cache-tags**, all via API and dashboard. ([Cloudflare Docs][17])
* Fits your “delete after 30 days” requirement by either short TTLs + versioned URLs or explicit purge on delete.

**Image optimization**

* **Cloudflare Image Resizing**: transform/crop/convert images at the edge by prefixing URLs with `/cdn-cgi/image/<options>/...` (e.g. format auto, quality, width, height). ([Cloudflare Docs][18])
* **Cloudflare Images** (separate product – see I) for storage+resizing+delivery.

**Custom domains & SSL**

* Custom hostnames via CNAME or full DNS delegation; free TLS certificates on all plans.

**Integration with object storage**

* Works with any HTTP(S) origin (S3, GCS, R2, Backblaze B2, Wasabi, DO Spaces, etc).
* **Cloudflare R2**: S3-compatible object storage with *no egress fees* for any storage class; pairing R2 with Cloudflare CDN removes origin egress as a cost line item (only R2 storage + operations + CDN plan). ([Cloudflare Docs][10])
* **Bandwidth Alliance**: reduced/waived egress from partners like Backblaze, Wasabi to Cloudflare. ([Cloudflare][19])

---

### B. Amazon CloudFront

**PoPs / coverage**

* AWS reports hundreds of edge locations globally; recent regional post mentions **10 CloudFront edge locations in Thailand**. ([SG About Amazon][20])
* CDNPlanet’s Thailand mapping confirms CloudFront PoP in Bangkok. ([cdnplanet.com][21])

**Cache control & invalidation**

* Uses **behaviors** with TTL configuration and/or origin `Cache-Control`.
* Invalidation via console, API, or CLI; supports wildcards (e.g. `/event123/*`). ([AWS Documentation][22])

**Image optimization**

* No native “Image CDN” URL syntax, but AWS provides the **Dynamic Image Transformation for CloudFront** reference solution (CloudFront + S3 + Lambda / Lambda@Edge using Sharp). ([Amazon Web Services, Inc.][23])
* Practically: on-the-fly image resizing is possible but requires a small serverless stack.

**Custom domains & SSL**

* Custom CNAMEs mapped to distributions; managed ACM certificates for HTTPS.

**Integration with object storage**

* Native pairing with **S3** origins (including private buckets via OAC/OAI).
* When CloudFront is in front of S3 in the same region, S3 → CloudFront traffic is cheaper than S3 → internet, but origin egress is still a cost line item vs Cloudflare R2/Backblaze/Wasabi zero-egress setups.
* Also works with custom HTTP origins (e.g., GCS, DO Spaces) but then you lose some AWS-native advantages.

---

### C. Google Cloud CDN

**PoPs / coverage**

* Built on Google’s edge network; official edge location list includes **Bangkok** plus many nearby APAC metros (Singapore, Hong Kong, Jakarta, Kuala Lumpur, Tokyo, etc.). ([Google Cloud Documentation][3])

**Cache control & invalidation**

* Honors origin `Cache-Control` headers; additional policies via URL maps.
* Invalidation via console/API; supports **cache-tag**–based invalidation for batches (useful per-event). ([Google Cloud Documentation][24])

**Image optimization**

* Cloud CDN itself does **not** perform image optimization; StackOverflow guidance is to use a separate service or instance for image transforms, then cache via Cloud CDN. ([Stack Overflow][25])

**Custom domains & SSL**

* TLS configured on external HTTP(S) load balancer; Cloud CDN attaches at the LB; custom domains are straightforward.

**Integration with object storage**

* Typical pattern: **Cloud Storage bucket** (public or behind load balancer) + HTTPS LB + Cloud CDN. ([Stack Overflow][25])
* Works with hybrid origins, but cost-optimization is clearest when everything sits in GCP.

---

### D. bunny.net CDN

**PoPs / coverage**

* bunny advertises **27 PoPs in Asia**, with average latency ≈24 ms in the region. ([bunny.net][26])
* CDNPlanet lists a PoP in **Bangkok**. ([cdnplanet.com][21])

**Cache control & invalidation**

* Respects origin cache headers; custom cache settings per Pull Zone.
* Invalidation: purge by full URL, wildcard path, full zone, or **tag-based purging**; available via API. ([bunny.net Developer Hub][27])

**Image optimization**

* **Bunny Optimizer** add-on: flat price **$9.50/month per website** with unlimited requests; handles automatic image compression and resizing. ([bunny.net][28])

**Custom domains & SSL**

* Free SSL; custom hostnames per Pull Zone.

**Integration with object storage**

* Origin pull from any HTTP(S) origin (S3, GCS, DO Spaces, B2, etc.).
* Pairs particularly well with **Backblaze B2**, where B2 offers *free egress* to bunny.net for shared customers. ([backblaze.com][11])

---

### E. Fastly

**PoPs / coverage**

* Edge network in APAC with a **Bangkok** PoP listed by CDNPlanet; strong presence in nearby metros. ([cdnplanet.com][21])

**Cache control & invalidation**

* VCL/Compute@Edge based; very flexible cache logic.
* Instant purge via API by URL, surrogate key, or soft purge (not re-fetched until expired); documented as near-real-time global.

**Image optimization**

* Fastly has an **Image Optimizer** product (separate pricing) for resizing/compression at the edge; not detailed here due to limited public pricing in APAC.

**Custom domains & SSL**

* Custom certificates supported; free TLS options available.

**Integration with object storage**

* Commonly fronting S3/GCS and B2; B2 → Fastly egress is **free** via Backblaze partnership, leaving CDN egress as primary cost. ([backblaze.com][11])

---

## 5. Image-specific services

### F. Cloudinary

**Pricing & cost mapping**

* **Plus plan**: $89/month (annual billing) for **225 credits**; each credit can be 1 GB storage, 1 GB viewing bandwidth, or 1,000 transformations. ([Cloudinary][6])
* If used purely for bandwidth, 225 credits ≈ 225 GB/month. Effective egress cost ≈ **$0.40/GB** at that plan.
* At your tiers, assuming all credits devoted to bandwidth:

  * T1 (19 GB): within 225 GB → $89 effective (no cheaper tier above free).
  * T2 (277 GB): exceeds 225 GB; requires overage or higher plan (cost function becomes multi-dimensional).
  * T3 (1.85 TB): far beyond Plus tier; would require higher plans with negotiated pricing.
* Conclusion: unit cost per GB is materially higher than general CDNs at these volumes; cost model is “credits” not pure egress.

**Technical**

* Dynamic **URL-based transformations** (resize, crop, format, quality) on-the-fly. ([Cloudinary][29])
* CDN caching and **invalidation via API** – set `invalidate: true` when deleting/overwriting assets or use Admin API for bulk invalidations. ([Cloudinary][30])
* Supports **custom domains / private CDN hostnames** (CNAMEs). ([Cloudinary][31])

**Integration**

* Hosted storage + optional origin-based setups (S3 etc.); can also coordinate invalidation on your own CDN via webhook. ([support.cloudinary.com][32])

---

### G. ImageKit.io

**Pricing & cost mapping**

* **Free**: 20 GB bandwidth + 20 GB DAM storage. ([ImageKit][33])
* **Pro plan**: $89/month with **225 GB bandwidth** included; additional bandwidth at **$0.45/GB**. ([ImageKit][33])
* If used as primary image CDN (bandwidth-heavy):

  * T1 (19 GB): within free or Pro included; effectively $0 or $89 depending on plan choice.
  * T2 (277 GB): exceeds Pro 225 GB → 52 GB overage ≈ $23.4, total ≈ $112.4 if on Pro.
  * T3 (1.85 TB): 1,850 GB – 225 GB = 1,625 GB overage → ≈ $731 overage + $89 ≈ **$820/month**.
* Effective cost/GB at scale is considerably higher than general CDNs.

**Technical**

* Real-time **URL-based transforms** (resize, format, smart crop, etc.). ([ImageKit][34])
* Uses **Amazon CloudFront** as default CDN; can integrate your own CDN if needed. ([ImageKit][7])
* Cache invalidation: built on top of CloudFront’s mechanisms; ImageKit provides simplified interface.

**Integration**

* Connects directly to **Amazon S3, GCS, Azure Blob, web servers, and S3-compatible storage** as external origins. ([ImageKit][35])
* This aligns well with a “store once in object storage, transform at edge” pipeline.

---

### H. imgix

**Pricing & cost mapping**

* New **credit-based plans**: e.g. “Basic” **$75/mo** for 375 credits → up to 125 GB of media and **250 GB delivery bandwidth**; “Growth” $300/mo for 1,875 credits → up to 937 GB media and **1,875 GB delivery**. ([imgix.com][36])
* Effective per-GB egress cost at Growth tier ≈ $300 / 1,875 GB ≈ **$0.16/GB** (plus origin egress).
* Historical pricing referenced **$0.08/GB** per bandwidth GB for Standard plans, but this appears superseded by credit system. ([Tumblr][37])
* For your tiers:

  * T1/T2: fit within Basic/Growth allowances but minimum monthly spend is $75–300.
  * T3 (1.85 TB ≈ 1,894 GB): roughly fits within Growth bandwidth (1,875 GB) with small overage or upsize to enterprise; effective cost still > general CDNs per GB.

**Technical**

* Real-time **image processing** via URL params; optimizations include resizing, cropping, format conversion. ([docs.imgix.com][8])
* CDN caching; **purge API** allows invalidation of an image and its derivatives. ([docs.imgix.com][8])

**Integration**

* Supports origins: **S3, GCS, web folders, Azure, etc.**; set up as a “Source” that points at existing storage. ([docs.imgix.com][38])

---

### I. Cloudflare Images (+ Image Resizing)

**Pricing & cost mapping**

* Cloudflare Images: **$5 per 100,000 stored images** and **$1 per 100,000 delivered images**; storage purchased in increments of 100k images. ([Cloudflare Docs][9])
* Resizing and variant generation are included; *no additional egress fees* for images served via Cloudflare. ([Cloudflare Docs][9])
* Cost depends on **image views**, not GB. Without assumptions on “views per GB”, it’s not possible to map directly to your 19/277/1.85 TB volume tiers.

**Technical**

* Upload once; request predefined **variants** or ad-hoc transformations via `/cdn-cgi/image/...` syntax. ([Cloudflare Docs][18])
* Delivered over Cloudflare’s global CDN; caching behavior similar to other Cloudflare assets.
* Invalidation occurs when an image is deleted or replaced; additionally, regular Cloudflare cache purge APIs apply.

**Integration**

* Cloudflare-hosted storage (Images) vs R2 + Image Resizing vs your existing S3/GCS; trade-off is control over origin vs convenience.
* Fits naturally with a Cloudflare CDN-centric architecture (DNS + CDN + object storage all in one).

---

## 6. Integration & storage combinations (egress-cost-driven)

Key observation: **storage–CDN pairing can remove or heavily discount origin egress**, shifting cost to either CDN egress or to per-image pricing.

### 6.1 Zero / reduced egress combos

* **Cloudflare R2 + Cloudflare CDN / Images**

  * R2 advertises **no egress fees** to the internet; data transfer out is free in all classes, you pay for storage and operations. ([Cloudflare Docs][10])
  * CDN cost is then purely Cloudflare’s plan fees and (for Cloudflare Images) per-image storage/delivery.

* **Backblaze B2 + Cloudflare / bunny / Fastly**

  * B2 offers **free egress** to Cloudflare, Fastly, and bunny.net via the Bandwidth Alliance; origin→CDN is zero-cost; you still pay CDN → user egress. ([backblaze.com][11])

* **Wasabi + Cloudflare**

  * Wasabi advertises **no egress and no API fees**; plus free transfer to Cloudflare for shared customers. ([Cloudflare][12])

### 6.2 CDN + object storage mapping

| CDN                           | Typical origin pairing            | Egress characteristics (origin→CDN)                                                                                                    |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare                    | R2, B2, Wasabi, S3, GCS           | Potentially zero (R2/B2/Wasabi) or discounted via Bandwidth Alliance; otherwise regular cloud egress. ([Cloudflare Docs][10])          |
| CloudFront                    | S3 (same region)                  | Discounted vs raw S3 egress, but still metered; no “zero egress” promise.                                                              |
| Cloud CDN                     | GCS via HTTP LB                   | Standard GCP egress pricing; benefits from Google’s internal backbone but not free. ([Google Cloud Documentation][15])                 |
| bunny                         | B2, S3-compatible stores          | Origin egress can be zero when using B2 (via Backblaze partnership). ([backblaze.com][11])                                             |
| Fastly                        | B2, S3, GCS                       | Free B2 egress; otherwise standard cloud egress. ([backblaze.com][11])                                                                 |
| Cloudinary / ImageKit / imgix | Their own storage or S3/GCS/Azure | Origin egress depends on underlying storage + peering; service cost is dominated by their credit / bandwidth charges. ([ImageKit][35]) |

---

## 7. Fit vs your design drivers

### 7.1 Cost (egress-dominated)

* At your current tiers, **raw per-GB CDN options (CloudFront, Cloud CDN, bunny)** yield **cents to low tens of dollars** per month in bandwidth charges; **image CDNs** (Cloudinary, ImageKit, imgix, Cloudflare Images) have **minimum spends in the $75–$100+ range** even at low volume. ([Cloudinary][6])
* For APAC-only traffic, bunny’s $0.03/GB and CloudFront/Cloud CDN’s assumed ~$0.02/GB are all within the same order-of-magnitude, with bunny slightly higher per GB but without cloud-provider lock-in. ([bunny.net][4])
* Cloudflare’s CDN bandwidth is effectively “flat-rate” (plan-based) rather than metered, so incremental egress cost is near zero; the main variables become plan tier and any add-ons. ([Cloudflare][13])

### 7.2 Thailand/Asia performance

* **Thailand PoPs**: Cloudflare (3 cities), CloudFront, bunny, Fastly all have Bangkok PoPs; Google’s edge network lists Bangkok as an edge location. ([cdnplanet.com][21])
* For your geo, any of these CDNs should be able to achieve low-tens-of-ms latency to end users, assuming DNS and TLS are tuned.

### 7.3 Image optimization

* **Built-in / URL-based**: Cloudflare Image Resizing, Cloudflare Images, bunny Optimizer, Cloudinary, ImageKit, imgix all offer URL-based transformations (resize, format, quality). ([Cloudflare Docs][18])
* **General CDNs without native image resize**: CloudFront and Cloud CDN require a separate resizing layer (serverless or third-party) and then cache the result. ([Amazon Web Services, Inc.][23])

### 7.4 Cache invalidation (30-day delete)

All candidates support programmatic purging suitable for 30-day retention:

* Cloudflare: purge by URL, prefix, host, or tags; instant purge. ([Cloudflare Docs][17])
* CloudFront: invalidation API with wildcards. ([AWS Documentation][22])
* Cloud CDN: invalidation by path and cache tags. ([Google Cloud Documentation][24])
* bunny: purge by URL, wildcard, tag, or full zone. ([bunny.net Developer Hub][27])
* Image CDNs: Cloudinary, ImageKit, imgix, Cloudflare Images all provide purge/invalidate APIs around their own CDN layers. ([Cloudinary][30])

---

## 8. Open questions / data needed to narrow down

These are follow-up questions that would meaningfully change the “best fit” subset:

1. **Typical image size & request rate**

   * e.g., average bytes per view (after WebP/AVIF) and expected daily peak views per event. This affects whether per-image vs per-GB pricing is favorable.

2. **Object storage decision**

   * If you lean toward **R2 / B2 / Wasabi**, Cloudflare/bunny/Fastly combos become structurally cheaper due to zero/discounted egress.
   * If you standardize on **S3 or GCS**, CloudFront or Cloud CDN might be operationally simpler.

3. **How much on-the-fly processing do you need?**

   * Simple responsive sizes with a small set of breakpoints vs heavy per-request custom transformations.
   * This determines whether general CDN + a lightweight image-resize layer is enough, or if a full image CDN (Cloudinary/ImageKit/imgix/Cloudflare Images) is justified despite higher per-GB cost.

4. **Future geos beyond Thailand/Asia**

   * If you may add Europe/US users, price differentials between providers across multiple regions become more important (bunny vs CloudFront vs Cloudflare vs GCP).

5. **Compliance / data residency constraints**

   * Some CDNs and storage providers have clearer controls for region pinning and legal requirements; this could constrain choices.

---

If you want, next step can be:

* Pick 2–3 **CDN + storage combos** (e.g., Cloudflare R2+CDN, B2+bunny, S3+CloudFront) and model **full end-to-end cost** including storage, ops, and image pipeline, for your three egress tiers and a few plausible “images per GB” scenarios.

[1]: https://www.cloudflare.com/application-services/products/cdn/?utm_source=chatgpt.com "Cloudflare CDN | Content Delivery Network"
[2]: https://www.elite.cloud/post/amazon-cloudfront-pricing-guide-optimize-speed-and-lower-aws-costs/ "Amazon CloudFront Pricing Guide: Optimize Speed and Lower AWS Costs"
[3]: https://docs.cloud.google.com/vpc/docs/edge-locations?utm_source=chatgpt.com "Network edge locations | Virtual Private Cloud"
[4]: https://bunny.net/pricing/?utm_source=chatgpt.com "CDN Pricing | Affordable Pay As You Go CDN"
[5]: https://www.fastly.com/legacy-pricing?utm_source=chatgpt.com "Legacy Online Paid Account Pricing (2025)"
[6]: https://cloudinary.com/pricing?utm_source=chatgpt.com "Cloudinary - Pricing and Plans"
[7]: https://imagekit.io/docs/core-delivery-features?utm_source=chatgpt.com "Core Delivery Features"
[8]: https://docs.imgix.com/en-US/getting-started/setup/purging-assets?utm_source=chatgpt.com "Purging Assets | Setup | Getting Started"
[9]: https://developers.cloudflare.com/images/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Images docs"
[10]: https://developers.cloudflare.com/r2/pricing/?utm_source=chatgpt.com "R2 pricing"
[11]: https://www.backblaze.com/blog/cdn-bandwidth-fees-what-you-need-to-know/?utm_source=chatgpt.com "CDN Bandwidth Fees: Costs, Factors, and How to Save"
[12]: https://www.cloudflare.com/partners/technology-partners/wasabi/?utm_source=chatgpt.com "Wasabi - Tech Partners"
[13]: https://www.cloudflare.com/plans/free/?utm_source=chatgpt.com "Free Plan Overview"
[14]: https://www.cloudflare.com/small-business/?utm_source=chatgpt.com "Cloudflare for Small & medium-sized businesses"
[15]: https://docs.cloud.google.com/cdn/pricing "Pricing  |  Cloud CDN  |  Google Cloud"
[16]: https://docs.digitalocean.com/products/spaces/details/pricing/?utm_source=chatgpt.com "Spaces Pricing | DigitalOcean Documentation"
[17]: https://developers.cloudflare.com/api/resources/cache/methods/purge/?utm_source=chatgpt.com "Purge Cached Content - Cloudflare API"
[18]: https://developers.cloudflare.com/images/transform-images/transform-via-url/?utm_source=chatgpt.com "Transform via URL · Cloudflare Images docs"
[19]: https://www.cloudflare.com/bandwidth-alliance/?utm_source=chatgpt.com "Bandwidth Alliance | Reduce Data Transfer Fees"
[20]: https://www.aboutamazon.sg/news/job-creation-and-investment/new-aws-region-in-thailand-to-launch-by-early-2025?utm_source=chatgpt.com "New AWS Region in Thailand to launch by early 2025"
[21]: https://www.cdnplanet.com/geo/thailand-cdn/?utm_source=chatgpt.com "Thailand CDN | 14 content delivery networks"
[22]: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation_Requests.html?utm_source=chatgpt.com "Invalidate files - Amazon CloudFront"
[23]: https://aws.amazon.com/solutions/implementations/dynamic-image-transformation-for-amazon-cloudfront/?utm_source=chatgpt.com "Dynamic Image Transformation for Amazon CloudFront"
[24]: https://docs.cloud.google.com/cdn/docs/invalidating-cached-content?utm_source=chatgpt.com "Invalidate cached content | Cloud CDN"
[25]: https://stackoverflow.com/questions/53646540/create-a-cdn-with-google-cloud-and-image-optimization?utm_source=chatgpt.com "Create a CDN with Google Cloud and Image Optimization"
[26]: https://bunny.net/network/?utm_source=chatgpt.com "Global CDN Network | Low latency CDN with 119+ PoPs"
[27]: https://docs.bunny.net/reference/pullzonepublic_purgecachepostbytag?utm_source=chatgpt.com "Purge Cache"
[28]: https://bunny.net/pricing/optimizer/?utm_source=chatgpt.com "Bunny Optimizer Pricing | Optimize your Website for $9.50 ..."
[29]: https://cloudinary.com/documentation/image_transformations?utm_source=chatgpt.com "Image Transformations for Developers | Documentation"
[30]: https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn?utm_source=chatgpt.com "Invalidate cached assets | Documentation"
[31]: https://cloudinary.com/documentation/advanced_url_delivery_options?utm_source=chatgpt.com "Advanced CDN Media Asset Delivery Options"
[32]: https://support.cloudinary.com/hc/en-us/articles/360014799800-Custom-cache-invalidation?utm_source=chatgpt.com "Custom cache invalidation"
[33]: https://imagekit.io/plans/?utm_source=chatgpt.com "Pricing plans | ImageKit.io"
[34]: https://imagekit.io/?utm_source=chatgpt.com "Image and Video API + AI-powered DAM | ImageKit.io"
[35]: https://imagekit.io/docs/integration/connect-external-storage?utm_source=chatgpt.com "Connect external storage"
[36]: https://www.imgix.com/pricing?utm_source=chatgpt.com "Imgix Pricing Plans"
[37]: https://imgix.tumblr.com/page/4?utm_source=chatgpt.com "blog • imgix • Real-time image processing and image CDN"
[38]: https://docs.imgix.com/en-US/getting-started/setup/creating-sources?utm_source=chatgpt.com "Creating Sources | Setup | Getting Started"
