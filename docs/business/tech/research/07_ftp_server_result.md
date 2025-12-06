## 0. High-level summary (what this research shows)

* Modern pro bodies (Nikon Z8/Z9, Canon R5/R6/R5 II, many Sony Alpha) support **FTP / FTPS and increasingly SFTP**; however, some bodies are **FTP/FTPS-only** (e.g. Sony A7 IV – FTPS but no SFTP), so **plain FTP/FTPS is still required for true drop-in compatibility**. ([onlinemanual.nikonimglib.com][1])
* FTP/SFTP *does* require an always-listening endpoint; you **cannot implement the camera side of FTP on a pure scale-to-zero/FaaS pattern**. You must pay at least for a small VM (self-hosted) or a managed hourly endpoint like AWS Transfer Family / Azure SFTP. ([Medium][2])
* Cost floor for a 24/7 small self-hosted server (e.g. EC2 t4g.nano + SFTPGo + S3) is on the order of **~$7.5 (฿240) at Tier 1, ~$25 (฿816) at Tier 2, ~$93 (฿2,973) at Tier 3** (compute + S3 storage; ingress free, egress extra). ([instances.vantage.sh][3])
* Fully managed FTP endpoints like **AWS Transfer Family** cost about **$216 (฿6,901) per month per always-on protocol endpoint**, plus **~$0.04/GB (฿1.28/GB) transfer and S3 storage**, so total ~$228–450 (฿7,285–14,382) for your three tiers at the assumed peak volume. ([Amazon Web Services, Inc.][4])
* Third-party SaaS FTP/SFTP gateways (Couchdrop, SFTPCloud, SFTP To Go) charge **flat monthly fees in the $40–300+ range (฿1,278–9,588+)**, typically with included transfer quotas; at your Tier 2–3 volumes (up to ~3.6 TB/month at peak assumptions), you rapidly hit mid- to high-tier plans. ([sftpcloud.io][5])

Overall: **FTP *does* break strict scale-to-zero** (you must pay for something that listens), but you can keep that something **small and inexpensive** if you self-host; or you can pay materially more for fully-managed (AWS Transfer / Azure / SaaS) to reduce ops work.

---

## 1. Camera protocol support (FTP vs FTPS vs SFTP)

### 1.1 Nikon Z8 / Z9

* Nikon docs list **FTP, SFTP and FTPS** as supported for cameras like Z8/Z9 in the network/FTP transfer section. ([onlinemanual.nikonimglib.com][1])

### 1.2 Canon R5 / R6 / R5 II

* **EOS R5 / R6 (original)**: Canon network manuals show **FTP and FTPS** support via the camera’s built-in FTP client. ([cam.start.canon][6])
* **EOS R5 Mark II / R6 Mark II / R3**: Canon firmware / documentation mentions **FTP/FTPS/SFTP support** on newer bodies plus integration with **Mobile File Transfer** app, which can upload to FTP/FTPS/SFTP via 5G mobile networks. ([Canon Iceland][7])

### 1.3 Sony Alpha series

* Sony’s A7 IV manual explicitly mentions **FTPS (“FTPES”)** for encrypted transfers; docs show FTP/FTPS but no SFTP option in menus. ([Help Guide][8])
* Newer high-end bodies (e.g. **A7S III firmware 3.x, α1 II, some 9-series**) add **SFTP** support via firmware, in addition to FTP/FTPS. ([Sony ประเทศไทย][9])
* Sony provides a generic **“FTP Help Guide”** which describes FTP server registration, passive mode, FTPS certificates, etc., confirming standard client behaviour. ([Help Guide][10])

### 1.4 Summary table

| Camera family             | Built-in protocols (body alone)                                 | Via vendor mobile apps                                                                    | Notes                                                   |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Nikon Z8/Z9               | FTP, FTPS, SFTP ([onlinemanual.nikonimglib.com][1])             | Also via SnapBridge/NX Field etc.                                                         | Very flexible; any of the three server types acceptable |
| Canon R5 / R6 (original)  | FTP, FTPS ([cam.start.canon][6])                                | Mobile File Transfer can upload to FTP/FTPS/SFTP via phone ([parkcameras.com][11])        | On-camera: no SFTP; SFTP only via phone bridge          |
| Canon R5 II / R6 II / R3  | FTP, FTPS, SFTP (per recent docs/firmware) ([Canon Iceland][7]) | Mobile File Transfer also supports FTP/FTPS/SFTP                                          | High-end can go full SFTP                               |
| Sony A7 IV                | FTP, FTPS (“FTPES”), **no SFTP** ([Help Guide][8])              | Content Transfer Professional app can upload to FTP/FTPS/SFTP via phone ([App Store][12]) | Needs FTP/FTPS server for direct camera-to-cloud        |
| Sony A7S III / α1 II etc. | FTP, FTPS, SFTP (with recent firmware) ([Sony ประเทศไทย][9])    | Same mobile options as above                                                              | Newer models can use SFTP                               |

**Implication for compatibility:**
To be a **drop-in replacement across these bodies**, the server **must support at least FTP and FTPS**; **SFTP alone is not sufficient** because some widely used cameras (A7 IV, older Canon) cannot speak SFTP directly.

---

## 2. Protocol & architecture implications (FTP/FTPS vs SFTP)

### 2.1 Transport characteristics

* **FTP**: separate control and data connections; active vs passive modes; sensitive to NAT/firewalls. ([Server Fault][13])
* **FTPS (FTPES)**: same connection pattern as FTP, but encrypted control and/or data using TLS; requires certificates and passive port ranges in firewall. ([ProFTPD][14])
* **SFTP**: single SSH-based connection (port 22 by default); behaves like an SSH subsystem; much simpler for firewalls and NAT. ([OpenSSH][15])

### 2.2 Always-on requirement vs serverless

* FTP/FTPS/SFTP clients open **long-lived TCP sessions** and expect a server to be listening at a fixed hostname/port at the time of connection.
* FaaS platforms like AWS Lambda are **invoke-per-request**, have hard execution time limits, and are not designed to keep open sockets for arbitrary durations. ([Amazon Web Services, Inc.][16])
* Practical result: **you need a long-running process** somewhere (VM, container, or managed endpoint) to speak FTP/FTPS/SFTP to cameras; you can still use serverless *behind* that (e.g. S3 events → Lambda, webhooks → ingest pipeline).

**Direct answer to key question:**
Yes – **FTP/SFTP inherently requires a non-serverless, always-on listener**, so your architecture cannot be *pure* scale-to-zero. You can, however, keep that component **small and cost-minimal** and keep the rest (ingest pipeline, processing) serverless.

---

## 3. Traffic and throughput assumptions

Using your stated peak:

* Peak: **100 MB/minute** ≈ 6,000 MB/hour ≈ **6 GB/hour**.
* Assume **3 hours of shooting per event** (mid-point of 2–4 hours) → **18 GB per event**.
* Monthly volumes at peak:

| Tier | Events / month | GB / event | Approx GB / month     |
| ---- | -------------- | ---------- | --------------------- |
| 1    | 10             | 18         | **180 GB**            |
| 2    | 50             | 18         | **900 GB**            |
| 3    | 200            | 18         | **3,600 GB (3.6 TB)** |

These are **upper-bound** volumes; real traffic may be lower if 100 MB/min is not sustained.

---

## 4. Solutions found (catalogue)

### 4.1 Overview table

| Solution / Stack                                          | Category                      | Storage backend                                                     |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| **AWS Transfer Family (FTP/FTPS/SFTP) → S3/EFS**          | Managed FTP/SFTP service      | AWS S3 or EFS ([Amazon Web Services, Inc.][17])                     |
| **Self-hosted SFTPGo on EC2 (FTP/SFTP/FTPS) → S3**        | Traditional FTP (self-hosted) | S3 (or other object store) ([sftpgo.com][18])                       |
| **Self-hosted vsftpd / ProFTPD on EC2 → local disk → S3** | Traditional FTP (self-hosted) | Local disk + sync to S3                                             |
| **Couchdrop / SFTPCloud / SFTP To Go**                    | SaaS managed FTP/SFTP gateway | Bring-your-own storage (S3, Blob, Drive, etc.) ([sftpcloud.io][19]) |
| **Azure Blob Storage SFTP endpoint**                      | Managed SFTP (no FTP)         | Azure Blob Storage ([Microsoft Azure][20])                          |

Below: each option with technical / cost / ops details and integration notes.

---

## 5. Option A – AWS Transfer Family (managed FTP/FTPS/SFTP → S3)

### 5.1 Technical

* **Protocols**: supports **SFTP, FTPS, FTP** on a single endpoint, directly into S3 or EFS. ([Amazon Web Services, Inc.][17])
* **Passive mode**: AWS docs define fixed passive port ranges (8192–8200) for FTP/FTPS; you open these in security groups, so passive mode works behind NAT/firewalls. ([Tutorials Dojo][21])
* **TLS/security**: FTPS uses AWS Certificate Manager certs; SFTP uses SSH keys; service is PCI-DSS, SOC, HIPAA, GDPR compliant. ([Amazon Web Services, Inc.][22])
* **Concurrency**: described as **highly available and auto-scaling**; no hard per-endpoint connection limit; 20 concurrent camera uploads is well below typical throughput. ([Amazon Web Services, Inc.][17])
* **Integration**: files land in S3/EFS; Transfer Family emits **EventBridge events per transfer**, enabling direct triggers to Lambda/SQS/Step Functions; also supports “managed workflows” for post-upload processing. ([Amazon Web Services, Inc.][22])

### 5.2 Cost

Pricing (US regions; other regions similar):

* **Endpoint hourly**: **0.30 USD/hour per enabled protocol**, charged from creation until deletion, even if “stopped”. ([Amazon Web Services, Inc.][4])
* **Transfer**: **0.04 USD/GB** uploaded/downloaded over FTP/FTPS/SFTP. ([Amazon Web Services, Inc.][4])
* **S3 storage**: S3 Standard is ≈0.025 USD/GB-month in APAC regions like Singapore. ([Enterprise Storage Forum][23])

Assuming:

* One endpoint with **FTP+FTPS+SFTP enabled** (3 protocols) 24/7 → **3 × 216 = 648 USD/month** in endpoint fees.
* If you enabled **only FTPS+SFTP** (no plain FTP) you’d pay **2 × 216 = 432 USD/month** instead.

For concreteness, here is **single-protocol** cost (e.g. just FTPS or just SFTP) with your peak volumes:

| Tier | Srv hours (24/7) | Endpoint cost (1 protocol) | Transfer (0.04 USD/GB) | S3 storage (0.025 USD/GB) | Approx total (USD) | Approx total (THB, 31.96 THB/USD) |
| ---- | ---------------- | -------------------------- | ---------------------- | ------------------------- | ------------------ | --------------------------------- |
| 1    | 720              | 216                        | 7.2                    | 4.5                       | **≈227.7**         | **≈7,277 THB**                    |
| 2    | 720              | 216                        | 36                     | 22.5                      | **≈274.5**         | **≈8,773 THB**                    |
| 3    | 720              | 216                        | 144                    | 90                        | **≈450**           | **≈14,382 THB**                   |

If you enable multiple protocols simultaneously, **multiply the endpoint cost by number of protocols** (data + S3 storage unchanged). ([Amazon Web Services, Inc.][22])

### 5.3 Operational

* **Always-on**: AWS explicitly states billing is hourly from creation until deletion; **stopping** the server does *not* stop billing. ([Amazon Web Services, Inc.][22])
* **Complexity**: fully managed; AWS handles scaling, HA, and patching; you manage users, IAM, and DNS.
* **Monitoring/logging**: CloudWatch metrics and JSON logs, plus CloudTrail for S3 API operations. ([Amazon Web Services, Inc.][22])

**Fit to requirements:**

* Drop-in: **Yes** – supports FTP, FTPS, SFTP, passive, TLS.
* Cost: material fixed floor (hundreds of USD/month if multiple protocols).
* Integration: **strong** with S3 → EventBridge → ingest pipeline; minimal glue code.

---

## 6. Option B – Self-hosted SFTPGo on EC2 (FTP/SFTP/FTPS → S3)

### 6.1 Technical

* **SFTPGo** is an **event-driven file transfer server** supporting **SFTP, FTP/S, HTTP/S, WebDAV** in one daemon. ([sftpgo.com][18])
* **Storage backends**: supports **local filesystem, encrypted local, S3-compatible object stores, Google Cloud Storage, Azure Blob, other SFTP servers**; per-user “virtual folders” can map different paths/buckets. ([GitHub][24])
* **Passive mode & TLS**: supports FTP/S with configurable passive port ranges and PROXY protocol support behind load balancers. ([docs.sftpgo.com][25])
* **Concurrency/perf**: written in Go; tutorials show deployments backing S3 at decent throughput; 20 concurrent uploads at ~13 Mbps total is far below typical EC2 network limits. ([docs.sftpgo.com][26])
* **Integration**: has **event hooks / workflows** and can run scripts or webhooks on upload events; when using S3 backend, files are already in object storage for your pipeline. ([sftpgo.com][18])

### 6.2 Cost (example: EC2 t4g.nano, 24/7)

* **Compute**: EC2 **t4g.nano** (2 vCPU, 0.5 GiB) ≈ **0.0042 USD/hour**, i.e. ≈3.02 USD/month if run 24/7. ([instances.vantage.sh][3])
* **S3 storage**: 0.025 USD/GB-month (approx). ([Enterprise Storage Forum][23])
* **Data transfer into S3**: AWS charges **0 USD/GB for data ingress**; you mainly pay request fees, which are small at these volumes compared to storage. ([Amazon Web Services, Inc.][27])

Approx totals (ignoring S3 request costs and EC2 data egress):

| Tier | Volume (GB/mo) | EC2 t4g.nano (USD/mo) | S3 storage (USD) | Approx total (USD) | Approx total (THB) |
| ---- | -------------- | --------------------- | ---------------- | ------------------ | ------------------ |
| 1    | 180            | 3.02                  | 4.50             | **≈7.52**          | **≈240 THB**       |
| 2    | 900            | 3.02                  | 22.50            | **≈25.52**         | **≈816 THB**       |
| 3    | 3,600          | 3.02                  | 90.00            | **≈93.02**         | **≈2,973 THB**     |

* If you prefer more RAM, **t4g.micro** at 0.0084 USD/hour ≈ 6.13 USD/month; same calculations with +3.1 USD to totals. ([instances.vantage.sh][28])

### 6.3 Operational

* **Always-on**: requires 24/7 VM or at least during event windows; you control when to run the instance (e.g. stop outside events to save cost, at the price of manual/automation complexity).
* **Self-host complexity**: you manage OS, updates, TLS certificates, firewall (including passive ports), backups of config/db.
* **Monitoring/logging**: SFTPGo has admin UI, logs, and metrics; you can integrate with your existing log stack. ([sftpgo.com][18])

**Fit to requirements:**

* Drop-in: **Yes** – supports FTP, FTPS, and SFTP with passive/TLS; maps users to per-event directories/buckets.
* Cost: **Low fixed cost**, dominated by storage; lower than AWS Transfer by ~1–2 orders of magnitude at small scale.
* Integration: direct S3 backend + upload event hooks give clean ingestion triggers.

---

## 7. Option C – Self-hosted vsftpd / ProFTPD on EC2

### 7.1 Technical

* **vsftpd** is a widely used **secure, lightweight FTP server** supporting passive mode and TLS (FTPS). ([security.appspot.com][29])
* **ProFTPD** offers rich configuration, with **mod_tls for TLS/FTPS** and documented passive port handling behind firewalls. ([ProFTPD][14])
* Both are **FTP/FTPS only**; for SFTP you’d additionally run an **SSH/SFTP server (OpenSSH)**, which can provide SFTP as an internal subsystem with chroot. ([OpenSSH][15])
* **Integration**: typical pattern is **local disk landing zone** → background sync to object storage (e.g. `aws s3 sync`, `rclone`, or SFTPGo as a “sub-backend” to S3). ([Hevo Data][30])

### 7.2 Cost

* Compute cost is **same order as SFTPGo** (small t4g instance or similar VPS). ([instances.vantage.sh][3])
* You may allocate more local disk (EBS/SSD) for the landing zone; object storage costs depend on sync strategy (e.g. delete after ingest to keep storage down).

### 7.3 Operational

* Requires **more manual glue** for:

  * Detecting completed uploads (inotify, cron)
  * Syncing to object storage
  * Triggering ingest pipeline
* Otherwise similar admin surface to SFTPGo (firewall, TLS, users, logs).

**Fit to requirements:**

* Drop-in: **Yes** for FTP/FTPS; SFTP support via OpenSSH if needed.
* Cost: low (like Option B), but **more custom integration** work vs SFTPGo’s built-in object-storage backends and hooks.

---

## 8. Option D – FTP/SFTP as SaaS (Couchdrop / SFTPCloud / SFTP To Go)

### 8.1 Technical

Representative offerings:

* **SFTPCloud**: “FTP & SFTP as a service”, hosts SFTP/FTPS/FTP and lets you attach your own cloud storage (S3, Spaces, Backblaze, etc.). Lite plan includes 1 server, 5 users, FTPS and SFTP, webhooks. ([sftpcloud.io][19])
* **Couchdrop**: cloud-native **SFTP/FTP** gateway to your storage (S3, Azure Blob, Google Drive, etc.), with file-based automations and webhooks. ([couchdrop.io][31])
* **SFTP To Go**: managed **SFTP/FTPS/S3/HTTPS** with no servers to manage; built on AWS; marketed for compliance-heavy use cases. ([sftptogo.com][32])

Most support:

* FTP/FTPS and SFTP endpoints
* Static IPs and custom domains
* Basic event hooks or webhooks for triggering pipelines

### 8.2 Cost

Representative published prices:

* **SFTPCloud Lite**: 39 EUR/month, 10 GB included storage (then BYO storage), 1 SFTP server, 5 users. ([sftpcloud.io][5])
* **Couchdrop**:

  * Link: 50 USD/month, 1 SFTP/FTP endpoint, 100 GB transfer/month.
  * Essentials: 300 USD/month, up to 10 users/endpoints, 1 TB transfer/month.
  * Business: 450 USD/month, up to 100 users/endpoints, unlimited transfer. ([Capterra][33])
  * 50 / 300 / 450 USD correspond to ≈1,598 / 9,588 / 14,382 THB at 31.96 THB/USD.
* **SFTP To Go**: plans from **~50–80+ USD/month** upwards, with tiers based on users/storage/transfer. ([TrustRadius][34])

Given your peak volumes:

* **Tier 1 (180 GB/month)** exceeds Couchdrop Link’s 100 GB transfer; you’d need at least **Essentials (300 USD)**.
* **Tier 2 (900 GB/month)** is just under 1 TB, still within Essentials; Tier 3 (3.6 TB) would require Business or negotiated tiers.

### 8.3 Operational

* **No servers**: provider manages scaling, HA, and protocol handling.
* You manage credentials, mapping to storage buckets/folders, and webhook integration with your ingest pipeline.
* Vendor lock-in exists at the control plane (APIs, UI), but storage can remain your S3/Blob bucket.

**Fit to requirements:**

* Drop-in: **Yes** – they expose standard FTP/FTPS/SFTP endpoints.
* Cost: **flat subscription**, which is relatively high vs self-hosted at your volumes, but simpler to operate than rolling your own.
* Integration: usually straightforward via storage events or webhooks.

---

## 9. Option E – Azure Blob Storage SFTP endpoint

### 9.1 Technical

* Azure Blob Storage can expose **SFTP endpoints** for containers, allowing SFTP clients to read/write blobs directly. ([Microsoft Azure][20])
* **FTP/FTPS are *not* supported** natively; this is **SFTP only**.
* Supports per-user permissions and SSH keys; integrates with Event Grid for blob-created events (triggers ingestion). ([Microsoft Azure][20])

### 9.2 Cost

* **Endpoint**: SFTP for Blob charges **0.30 USD/hour per SFTP-enabled storage account/container**, similar to AWS Transfer’s per-protocol hourly cost. ([Microsoft Azure][20])
* **Storage / transfer**: standard Blob storage and bandwidth pricing.

For your traffic, **cost profile is similar to AWS Transfer Family SFTP-only**:

* Endpoint 24/7: ≈216 USD/month.
* Plus storage and transfer (Blob prices vary per region but are in the same ballpark as S3 Standard).

### 9.3 Operational

* **Always-on** by design; hourly billing as long as SFTP is enabled.
* Very clean integration if your stack is primarily Azure-based.
* Not sufficient alone for **drop-in FTP** (no FTP/FTPS), but works well for cameras that support SFTP or for workflows via mobile/desktop apps.

---

## 10. FTP alternatives (where cameras allow)

### 10.1 SFTP-only flows

Given protocol support:

* Nikon Z8/Z9 and higher-end Canon/Sony bodies can use **SFTP** directly. ([onlinemanual.nikonimglib.com][1])
* For these, you can safely operate **SFTP-only endpoints** (AWS Transfer SFTP, SFTPGo SFTP, Azure Blob SFTP) with strict security posture (SSH keys, strong ciphers).

However:

* To cover **Sony A7 IV and similar FTP-only/FTPS-only bodies**, you still need **FTP/FTPS** somewhere. ([Help Guide][8])

### 10.2 Vendor mobile apps as protocol bridges

* Canon’s **Mobile File Transfer** app can connect cameras to **FTP/FTPS/SFTP servers via mobile networks**, effectively bridging from camera to any of these protocols via smartphone. ([parkcameras.com][11])
* Sony’s **Content Transfer Professional** app similarly supports upload to **FTP/FTPS/SFTP servers** from media imported to a mobile device. ([App Store][12])

These can theoretically:

* Allow a **“SFTP-only” backend** while still servicing cameras that cannot speak SFTP directly (camera → phone → SFTP).
* However, they **change photographer workflow** (extra device/app step), which conflicts with your “drop-in replacement” constraint.

### 10.3 HTTP/HTTPS or direct-to-cloud alternatives

* Cameras today generally **do not** support generic HTTP APIs presigned-URL uploads directly; they target FTP/SFTP and vendor clouds.
* For Lightroom / desktop uploaders, you can introduce **HTTP or S3-presigned URL** flows that bypass FTP entirely, but that is **out of scope for in-camera uploads**.

---

## 11. Integration considerations across options

### 11.1 Ingest pipeline triggers

* **S3 / Blob based options (AWS Transfer, SFTPGo→S3, Azure SFTP):**

  * Use **object-created events** (S3 Event Notifications, EventBridge, Azure Event Grid) to trigger Lambda/Functions, enqueue to SQS/Service Bus, etc. ([Amazon Web Services, Inc.][22])
* **Self-hosted FTP on disk:**

  * Use **filesystem watchers** (inotify, systemd path units) or periodic scans to detect new files and push to your ingest endpoint.

### 11.2 Object storage strategy

* For long-term durability and serverless pipelines, **object storage as the authoritative source** is standard.
* SFTPGo and managed services that directly back onto S3/Blob **avoid extra copy hops** (camera → FTP server → object storage) and reduce failure surfaces. ([sftpgo.com][18])

### 11.3 Auth and per-event credentials

Across all options:

* Map **FTP/SFTP user accounts to “event” entities**.

  * Each event gets a user with home directory pointing to a per-event folder in S3/Blob or local disk.
  * Credentials can be username/password or SSH key (for SFTP).
* For AWS Transfer, user mappings and roles can enforce per-event S3 prefixes. ([AWS Documentation][35])
* For SFTPGo, per-user storage configuration can point to different S3 prefixes or buckets. ([docs.sftpgo.com][36])

### 11.4 Serverless boundary

* In all viable options, the **serverless boundary** is essentially:

  * **Cameras → FTP/SFTP endpoint (stateful)**
  * **Endpoint → object storage (stateless serverless triggers)**

Object storage events then drive a fully serverless image processing pipeline (resizing, AI tagging, delivery).

---

## 12. Does FTP break your scale-to-zero architecture?

**From the research:**

* **FTP/SFTP requires a long-running listener** (protocol design). ([Medium][2])
* **Managed services (AWS Transfer, Azure SFTP)** are explicitly described as **“always-on server endpoints”**, with **hourly billing from creation to deletion**, even when “stopped”. ([Amazon Web Services, Inc.][22])
* **FaaS (Lambda, etc.)** cannot maintain arbitrary-length TCP sessions; they are invoked per event with time limits and no fixed public port, so they cannot directly implement an FTP/SFTP server compatible with cameras. ([Amazon Web Services, Inc.][16])

**Therefore:**

* **Yes, FTP/SFTP introduces an unavoidable non-serverless component.**
* The **minimum cost** for this component, with the explored options, is roughly:

  * **~3–6 USD/month** for a tiny always-on EC2 instance (plus storage) for self-hosted. ([instances.vantage.sh][3])
  * **≥216 USD/month per protocol** for fully managed endpoints (AWS Transfer, Azure SFTP) plus data/storage. ([Amazon Web Services, Inc.][4])
  * **≈50–300+ USD/month** for third-party SaaS at your volumes. ([Capterra][33])

The rest of your system (ingest, processing, distribution) can remain **fully serverless / scale-to-zero**, with FTP acting purely as an edge gateway.

---

## 13. Open questions discovered

These are points where more information would sharpen design decisions:

1. **Primary cloud / region**

   * Are you committed to AWS, Azure, GCP, or multi-cloud? (This affects whether AWS Transfer or Azure SFTP is even viable.)

2. **Camera mix and protocol usage**

   * Proportion of Nikon vs Canon vs Sony; how many shooters already use SFTP vs FTP/FTPS? This drives how much you can lean on SFTP-only endpoints.

3. **Security / compliance constraints**

   * Is **unencrypted FTP** acceptable at all, or must all traffic use FTPS/SFTP? Canon/Sony cameras do support FTPS; forcing TLS may be compatible but needs per-body validation. ([Help Guide][8])

4. **Operational preference vs cost**

   * Is the business comfortable running and patching a small EC2/VPS (SFTPGo / vsftpd), or is a managed service preferred even at significantly higher cost?

5. **Event timing predictability**

   * If events are highly scheduled, you might consider **starting/stopping** a self-hosted instance only during event windows to reduce cost further; if events are ad-hoc, you may need 24/7 availability.

6. **Required latency from capture to availability**

   * If ingestion is latency-sensitive (near-live galleries), the design of sync / S3 event pipelines and file “completeness” detection (e.g. temporary file names vs final rename) becomes important.

---


[1]: https://onlinemanual.nikonimglib.com/z8/en/ftp_servers_connecting_via_ethernet_93.html?utm_source=chatgpt.com "FTP Servers: Connecting via Ethernet"
[2]: https://medium.com/%40dave-patten/serverless-architecture-pros-cons-and-use-cases-4a0769744ca2?utm_source=chatgpt.com "Serverless Architecture: Pros, Cons, and Use Cases"
[3]: https://instances.vantage.sh/aws/ec2/t4g.nano?utm_source=chatgpt.com "t4g.nano pricing and specs - Vantage"
[4]: https://aws.amazon.com/aws-transfer-family/pricing/?utm_source=chatgpt.com "AWS Transfer Family pricing"
[5]: https://sftpcloud.io/pricing?utm_source=chatgpt.com "Pricing plans for teams of all sizes."
[6]: https://cam.start.canon/th/C004/manual/html/UG-06_Network_0070.html?utm_source=chatgpt.com "EOS R6 : การถ่ายโอนภาพไปยัง FTP เซิร์ฟเวอร์ - Canon"
[7]: https://www.canon-is.com/cameras/eos-r5-mark-ii/specifications/?utm_source=chatgpt.com "Canon EOS R5 Mark II Camera - Specifications"
[8]: https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000656445.html?utm_source=chatgpt.com "ILCE-7M4 | Help Guide | Precautions - Sony Corporation"
[9]: https://www.sony.co.th/en/electronics/support/e-mount-body-ilce-7-series/ilce-7sm3/software/00257134?utm_source=chatgpt.com "ILCE-7SM3 System Software (Firmware) Update Ver. 3.01 ..."
[10]: https://helpguide.sony.net/di/ftp/v1/en/index.html?utm_source=chatgpt.com "SONY FTP Help Guide"
[11]: https://www.parkcameras.com/blog/news/canon-firmware-update-for-r5-and-r3_news-14-04?utm_source=chatgpt.com "Canon Firmware Update for R5 and R3"
[12]: https://apps.apple.com/th/app/content-transfer-professional/id6456751684?utm_source=chatgpt.com "Content Transfer Professional - App Store"
[13]: https://serverfault.com/questions/643083/proftpd-and-firewall-configuration-for-passiveports?utm_source=chatgpt.com "ProFTPD and firewall configuration for PassivePorts"
[14]: https://www.proftpd.org/docs/howto/TLS.html?utm_source=chatgpt.com "FTP and SSL/TLS"
[15]: https://www.openssh.com/manual.html?utm_source=chatgpt.com "OpenSSH: Manual Pages"
[16]: https://aws.amazon.com/blogs/compute/patterns-for-building-an-api-to-upload-files-to-amazon-s3/?utm_source=chatgpt.com "Patterns for building an API to upload files to Amazon S3"
[17]: https://aws.amazon.com/aws-transfer-family/features/?utm_source=chatgpt.com "AWS Transfer Family features | Amazon Web Services"
[18]: https://sftpgo.com/?utm_source=chatgpt.com "SFTP & FTP as a Managed Service (SaaS) and On-Premises"
[19]: https://sftpcloud.io/?utm_source=chatgpt.com "SFTPCloud: Managed SFTP & FTP as a service"
[20]: https://azure.microsoft.com/en-us/pricing/details/storage/blobs/?utm_source=chatgpt.com "Azure Blob Storage pricing"
[21]: https://tutorialsdojo.com/aws-transfer-family/?utm_source=chatgpt.com "AWS Transfer Family Cheat Sheet"
[22]: https://aws.amazon.com/aws-transfer-family/faqs/?utm_source=chatgpt.com "AWS Transfer Family FAQs | Amazon Web Services"
[23]: https://www.enterprisestorageforum.com/cloud/aws-s3-pricing/?utm_source=chatgpt.com "AWS S3 Pricing | Storage Costs by Region, Class & Data ..."
[24]: https://github.com/drakkan/sftpgo?utm_source=chatgpt.com "drakkan/sftpgo: Full-featured and highly configurable SFTP ..."
[25]: https://docs.sftpgo.com/2.7/config-file/?utm_source=chatgpt.com "Configuration file"
[26]: https://docs.sftpgo.com/2.6/tutorials/postgresql-s3/?utm_source=chatgpt.com "SFTPGo with PostgreSQL data provider and S3 backend"
[27]: https://aws.amazon.com/th/s3/pricing/?utm_source=chatgpt.com "ราคา Amazon S3 - พื้นที่จัดเก็บอ็อบเจ็กต์บนคลาวด์"
[28]: https://instances.vantage.sh/aws/ec2/t4g.micro?utm_source=chatgpt.com "t4g.micro pricing and specs - Amazon EC2 Instance Comparison"
[29]: https://security.appspot.com/vsftpd.html?utm_source=chatgpt.com "vsftpd - Secure, fast FTP server for UNIX-like systems"
[30]: https://hevodata.com/learn/ftp-s3/?utm_source=chatgpt.com "FTP S3 Integration: 2 Easy Methods"
[31]: https://www.couchdrop.io/?utm_source=chatgpt.com "Couchdrop: The cloud platform for SFTP and b2b file transfers"
[32]: https://sftptogo.com/?utm_source=chatgpt.com "SFTP To Go: Managed SFTP/FTPS Cloud Storage as a Service"
[33]: https://www.capterra.com/p/235278/Couchdrop/?utm_source=chatgpt.com "Couchdrop Software Pricing, Alternatives & More 2025"
[34]: https://www.trustradius.com/products/sftp-to-go/pricing?utm_source=chatgpt.com "SFTP To Go Pricing 2025"
[35]: https://docs.aws.amazon.com/transfer/latest/userguide/sftp-for-transfer-family.html?utm_source=chatgpt.com "Configuring an SFTP, FTPS, or FTP server endpoint"
[36]: https://docs.sftpgo.com/2.6/s3/?utm_source=chatgpt.com "S3 Compatible Object Storage backends"
