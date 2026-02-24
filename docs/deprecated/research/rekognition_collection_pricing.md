# AWS Rekognition Collection Pricing Research

**Date:** 2025-12-03
**Status:** Complete

## Summary

AWS Rekognition collections have **no per-collection creation or maintenance fee**. You only pay for (1) face storage at $0.00001 per face vector per month, (2) IndexFaces API calls to add faces, and (3) SearchFacesByImage API calls to search. There is no hard limit on number of collections per account, but each collection can store up to 20 million face vectors. The recommended strategy is **one collection per event** to simplify data isolation, cleanup, and privacy compliance.

---

## Pricing Breakdown

### 1. Collection Creation/Maintenance

- **Cost:** $0 (FREE)
- **Notes:** No charges for creating or maintaining empty collections
- Collections are logical containers with no inherent storage cost

### 2. Face Storage (Face Metadata)

- **Cost:** $0.00001 per face vector per month
- **Proration:** Monthly charges are pro-rated for partial months
- **Example:** Storing 1 million faces for 15 days = 1,000,000 × $0.00001 × 0.5 = $5.00

### 3. IndexFaces API (Adding faces to collection)

- **Pricing tier (Group 1 API):**
  - First 1M images/month: $0.001 per image
  - Next 4M images/month: $0.0008 per image
  - Next 30M images/month: $0.0006 per image
  - Over 35M images/month: $0.0004 per image

### 4. SearchFacesByImage API (Searching for faces)

- **Same pricing as IndexFaces** (Group 1 API):
  - First 1M images/month: $0.001 per image
  - Next 4M images/month: $0.0008 per image
  - Next 30M images/month: $0.0006 per image
  - Over 35M images/month: $0.0004 per image

### 5. User Vectors (Optional - for user-face associations)

- **Cost:** $0.00001 per user vector per month
- **Default limit:** 10 million user vectors per collection
- **Note:** Only needed if using AssociateFaces/SearchUsers APIs

---

## Collection Limits and Quotas

### Per-Collection Limits (HARD LIMITS - Cannot be changed)

- **Maximum face vectors per collection:** 20 million
- **Maximum user vectors per collection:** 10 million (default)
- **Maximum matching results returned:** 4,096 faces or users per search

### Per-Account Limits (DEFAULT - Can be increased via support)

- **Number of collections:** No documented hard limit (effectively unlimited for typical use)
- **TPS (Transactions Per Second) - REGION DEPENDENT:**
  - **ap-southeast-1 (Singapore):**
    - IndexFaces/SearchFacesByImage: 5 TPS (default, can request increase)
    - DetectFaces: 25 TPS (default)
    - CreateCollection/DeleteCollection: 5 TPS (default)
  - **us-west-2 (Oregon):**
    - IndexFaces/SearchFacesByImage: 50 TPS (default, can request increase)
    - DetectFaces: 100 TPS (default)
    - CreateCollection/DeleteCollection: 5 TPS (default)
  - **us-east-1 (Virginia):**
    - IndexFaces/SearchFacesByImage: 50 TPS (default, can request increase)
    - DetectFaces: 100 TPS (default)
    - CreateCollection/DeleteCollection: 5 TPS (default)
  - Concurrent stored video jobs: 20

### Image Size Limits

- **Maximum image size (S3):** 15 MB
- **Maximum image size (bytes):** 5 MB
- **Minimum face size:** 40×40 pixels in 1920×1080 image
- **Supported formats:** PNG, JPEG

---

## Collection Strategy Recommendation

### RECOMMENDED: One Collection Per Event

**Rationale:**

1. **Data Isolation:** Each event's face data is completely isolated
2. **Privacy/GDPR Compliance:** Easy to delete entire event data (DeleteCollection)
3. **Simple Cleanup:** Delete collection after event retention period expires
4. **No Cross-Event Leakage:** Faces from Event A never match faces from Event B
5. **Cost Optimization:** Only pay for face storage during event lifetime
6. **Scalability:** Can have unlimited collections across thousands of events

**Operational Pattern:**

```
Event Created → CreateCollection(event_id) → Free
Upload Photos → IndexFaces → $0.001/photo
User Searches → SearchFacesByImage → $0.001/search
Store Faces (30 days) → $0.00001/face/month
Event Ends (30 days) → DeleteCollection(event_id) → Free
```

### ALTERNATIVE: Shared Collection with Metadata (NOT RECOMMENDED)

**Why Not Recommended:**

1. **Complex Metadata Management:** Must track event_id in ExternalImageId for every face
2. **No Automatic Cleanup:** Must manually DeleteFaces for expired events
3. **Potential Cross-Event Matching:** Risk of accidental matches across events
4. **GDPR Compliance Risk:** Harder to prove complete deletion of event data
5. **Collection Size Risk:** Could hit 20M face limit if not cleaning regularly
6. **No Cost Benefit:** Storage cost is the same ($0.00001/face/month)

**Only Use If:**

- You have a specific use case requiring cross-event face matching
- You need persistent user identity across multiple events
- You're building a long-term face database (not event-based)

---

## Cost Examples

### Example 1: Single Event (500 photos, 50 attendees searching)

- **Collection creation:** $0
- **IndexFaces (500 faces detected):** 500 × $0.001 = $0.50
- **SearchFacesByImage (50 searches):** 50 × $0.001 = $0.05
- **Storage (30 days):** 500 × $0.00001 × 1 month = $0.005
- **Collection deletion:** $0
- **Total:** $0.555

### Example 2: High-Volume Month (100 events, 100k photos, 10k searches)

- **IndexFaces (100k faces):** 100,000 × $0.001 = $100.00
- **SearchFacesByImage (10k searches):** 10,000 × $0.001 = $10.00
- **Storage (average 500 faces/event × 100 events × 30 days):** 50,000 × $0.00001 = $0.50
- **Total:** $110.50/month

### Example 3: Storage Cost Impact (Keeping faces for 6 months)

- **1,000 faces stored 6 months:** 1,000 × $0.00001 × 6 = $0.06
- **10,000 faces stored 6 months:** 10,000 × $0.00001 × 6 = $0.60
- **100,000 faces stored 6 months:** 100,000 × $0.00001 × 6 = $6.00

**Key Insight:** Storage cost is negligible compared to API costs for typical event retention periods (days to months).

---

## Best Practices

### 1. Collection Naming Convention

- Use predictable format: `facelink-event-{event_id}` or `facelink-{event_id}`
- Include metadata in tags (AWS resource tags) for organization
- Example: `facelink-event-20251203-abc123`

### 2. Collection Lifecycle Management

- **Create:** When event is created (before photos uploaded)
- **Index:** As photos are uploaded (batch processing recommended)
- **Search:** During and after event (active period)
- **Delete:** After retention period expires (30-90 days typical)

### 3. Cost Optimization

- **Batch IndexFaces calls:** Process multiple faces per API call when possible
- **Delete collections promptly:** Avoid ongoing storage costs for inactive events
- **Monitor storage:** Track face count per collection to predict costs
- **Use S3 lifecycle policies:** Auto-delete event photos after collection deleted

### 4. Error Handling

- **Handle ProvisionedThroughputExceededException:** Implement exponential backoff
- **Request TPS increase:** If processing many events concurrently
- **Validate face quality:** Use DetectFaces first to check face size/quality
- **Handle empty results:** SearchFacesByImage returns empty if no matches

### 5. Privacy and Compliance

- **Document retention policy:** How long face data is kept
- **Implement deletion workflow:** Automated cleanup after retention period
- **Audit trail:** Log all CreateCollection/DeleteCollection operations
- **User consent:** Ensure users agree to face recognition before indexing

---

## Quotas to Monitor

### When to Request TPS Increase

**IndexFaces:**

- Default: 5 TPS per region
- Request increase if: Processing >5 events simultaneously with bulk photo uploads
- Calculation: Peak concurrent uploads / average response time (5-15 seconds)

**SearchFacesByImage:**

- Default: 5 TPS per region
- Request increase if: >5 simultaneous user searches expected
- Typical need: High-traffic events with 100+ attendees searching at once

**CreateCollection/DeleteCollection:**

- Default: 5 TPS per region
- Request increase if: Creating/deleting >5 collections per second
- Unlikely to need increase for typical event platform

---

## Technical Implementation Notes

### Collection Creation (CreateCollection API)

```json
{
  "CollectionId": "facelink-event-20251203-abc123",
  "Tags": {
    "event_id": "abc123",
    "created_at": "2025-12-03T10:00:00Z",
    "retention_days": "30"
  }
}
```

- Response includes CollectionArn and FaceModelVersion
- No cost for creation

### Indexing Faces (IndexFaces API)

```json
{
  "CollectionId": "facelink-event-20251203-abc123",
  "Image": {
    "S3Object": {
      "Bucket": "facelink-photos",
      "Name": "event-abc123/photo-001.jpg"
    }
  },
  "ExternalImageId": "photo-001",
  "DetectionAttributes": ["ALL"],
  "MaxFaces": 100
}
```

- Detects up to 100 faces per image (default)
- Each detected face = 1 face vector stored
- Cost: $0.001 per image (first 1M/month)

### Searching Faces (SearchFacesByImage API)

```json
{
  "CollectionId": "facelink-event-20251203-abc123",
  "Image": {
    "Bytes": "<base64-encoded-image>"
  },
  "MaxFaces": 10,
  "FaceMatchThreshold": 80
}
```

- Returns up to 4,096 matches (hard limit)
- Cost: $0.001 per search (first 1M/month)
- Threshold: 80-99 (higher = stricter matching)

### Deleting Collection (DeleteCollection API)

```json
{
  "CollectionId": "facelink-event-20251203-abc123"
}
```

- Deletes collection and all face vectors
- No cost for deletion
- Cannot be undone (permanent deletion)

---

## Sources

1. **AWS Rekognition Pricing (Official)**
   - https://aws.amazon.com/rekognition/pricing/
   - Retrieved: 2025-12-03
   - Covers: Face storage ($0.00001/face/month), IndexFaces/SearchFacesByImage pricing tiers

2. **AWS Rekognition Quotas and Limits (Official)**
   - https://docs.aws.amazon.com/rekognition/latest/dg/limits.html
   - Retrieved: 2025-12-03
   - Covers: Collection limits (20M faces), TPS defaults (5), image size limits

3. **AWS Service Quotas - Rekognition (Official)**
   - https://docs.aws.amazon.com/general/latest/gr/rekognition.html
   - Retrieved: 2025-12-03
   - Covers: Regional TPS quotas, default limits, quota increase process

4. **AWS Rekognition API Reference (SearchFacesByImage)**
   - https://docs.aws.amazon.com/rekognition/latest/APIReference/API_SearchFacesByImage.html
   - Retrieved: 2025-12-03
   - Covers: API usage, response format, matching thresholds

5. **AWS Re:Post - Rekognition Pricing Questions**
   - https://repost.aws/questions/QUVS9XRUT7S8eP3dXY-ynkUw/aws-rekognition-searchfaces-api-question
   - Retrieved: 2025-12-03
   - Covers: Real-world pricing examples, cost calculation methodology

---

## Decision Summary

**For FaceLink photo-sharing platform:**

- **Strategy:** One collection per event
- **Why:** Simple, GDPR-compliant, easy cleanup, no cross-event data leakage
- **Cost Impact:** Negligible (storage is $0.00001/face/month)
- **Implementation:** CreateCollection on event creation, DeleteCollection after 30 days
- **Scaling:** No collection limit concerns (can handle unlimited events)
- **Region:** us-west-2 (Oregon)
  - **10x throughput advantage** (50 TPS vs 5 TPS in Singapore)
  - Latency trade-off: +150-200ms per call (acceptable for <3s target)
  - Zero additional cost (R2 egress to AWS is free)
  - PDPA compliant (no data residency requirement)
- **API Usage:** IndexFaces only (no separate DetectFaces call needed)
  - IndexFaces automatically detects faces AND indexes them in single call
  - Returns all face attributes via `DetectionAttributes: ['ALL']`
  - 50% fewer API calls vs calling DetectFaces + IndexFaces separately

**Key Takeaway:** Collections are free to create and maintain. The only costs are API usage (indexing/searching) and face storage, both of which are very low for typical event-based usage patterns. Using us-west-2 provides 10x throughput for zero additional cost, resolving rate limit concerns.
