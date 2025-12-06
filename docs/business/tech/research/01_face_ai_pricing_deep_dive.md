# Research Log: AWS Rekognition Pricing Model Deep Dive

**Status:** IN PROGRESS
**Date Created:** 2025-12-01
**Context:** Decision to use AWS Rekognition for MVP face detection + embedding
**Problem:** Current research uses "cost per face" but Rekognition likely bills differently (per image, per API call, or other unit)
**Goal:** Establish the ACTUAL billing model so we can calculate accurate infrastructure costs

---

## 1. Current Understanding (What We Think We Know)

From `01_face_ai_result.md`:
- Listed AWS Rekognition at **~$1.00 per 1,000 images**
- Applied to **15.5K / 157K / 1.25M faces/month** → calculated monthly costs
- **Problem:** Conflated "faces" with "images" – they are NOT the same unit

Current assumption:
- If 1 image = 1 API call = 1 billing unit, then cost/image is clear
- But Rekognition pricing page likely specifies **"image analysis"** or specific API operations

---

## 2. Key Questions to Answer

### 2.1 What is the ACTUAL billing unit?

**Possibilities:**
- [ ] Per **image analyzed** (regardless of face count)
- [ ] Per **1,000 images** (batch discount)
- [ ] Per **specific API operation** (e.g., `DetectFaces`, `SearchFacesByImage`, `IndexFaces`)
- [ ] Per **minute of API compute** (less likely, but possible)
- [ ] Tiered by **operation type** (detection vs search vs comparison costs differently?)

**Action needed:** Read AWS official pricing page + documentation for exact operation-level billing

### 2.2 Which Rekognition operations do WE use?

**Our workflow:**
1. **Photograph side (at upload):**
   - `DetectFaces` on each uploaded photo → extract face bounding boxes
   - `IndexFaces` on each face → store embeddings in collection (may be separate cost)

2. **Participant side (selfie + search):**
   - `DetectFaces` on selfie upload
   - `SearchFacesByImage` or `SearchFacesByImageId` → find matching faces

**Question:** Does each operation have a separate price, or is it bundled?

### 2.3 Does "free tier" or "included requests" factor in?

- AWS often includes free tier usage
- Rekognition may have monthly free requests (e.g., first 5K requests/month free)
- This matters for Tier 1 costs (might be $0 if under free tier)

---

## 3. Research Tasks

### Task 3.1: Official AWS Pricing Documentation
**What to find:**
- [ ] Current AWS Rekognition pricing page (as of Dec 2025)
- [ ] Exact price per operation type:
  - `DetectFaces` = ? per 1,000 images
  - `IndexFaces` = ? (is this separate?)
  - `SearchFacesByImage` = ? per search
  - Face comparison = ? per comparison
- [ ] Free tier limits (if any)
- [ ] Volume discounts (if scale beyond Tier 3)

**Source:** https://aws.amazon.com/rekognition/pricing/

### Task 3.2: Clarify "Image vs Face" Billing
**What to confirm:**
- [ ] If you submit 1 image with 3 faces:
  - Do you pay $X for 1 image analysis?
  - Or do you pay $X × 3 for 3 face analyses?
  - Or is it something else entirely?

### Task 3.3: Real-world usage patterns
**Context to gather:**
- [ ] What does "1 DetectFaces call" mean? (One image = one call, regardless of face count)
- [ ] Is there a batch API that's cheaper?
- [ ] Does storing embeddings in a Face Collection have its own cost (like vector DB)?

### Task 3.4: Calculate accurate Tier costs
**Once we have real pricing:**
- [ ] Tier 1: 5,000 photos × 1 call each = 5,000 calls → cost?
- [ ] Tier 2: 50,000 photos × 1 call each = 50,000 calls → cost?
- [ ] Tier 3: 400,000 photos × 1 call each = 400,000 calls → cost?
- [ ] Add search costs (participant selfie uploads + searches)
- [ ] Add storage costs (Face Collection storage, if applicable)

---

## 4. Key Assumptions to Validate

| Assumption | Current Value | Source | Needs Validation? |
| --- | --- | --- | --- |
| Billing unit | Per image | `01_face_ai_result.md` | **YES** |
| Cost per 1K images | $1.00 | DataCamp (secondary source) | **YES** |
| Free tier | None assumed | Not specified | **YES** |
| Volume discounts | None | Not found | **YES** |
| Separate indexing cost | Not modeled | Unknown | **YES** |
| Search operation cost | Not modeled | Unknown | **YES** |

---

## 5. Decision Tree

Once we have real pricing:

```
IF Rekognition pricing is per-image (not per-face):
  ✅ Use Rekognition for MVP

  THEN calculate costs:
    - DetectFaces: 5K / 50K / 400K images/month
    - SearchFacesByImage: Participant selfies + searches
    - Storage (Face Collections): Monthly cost

ELSE IF pricing is significantly different:
  → Reassess vs alternatives (Azure Face, Google Vision, etc.)
```

---

## 6. Timeline & Next Steps

1. **Immediate:** Fetch official AWS Rekognition pricing docs
2. **Same day:** Extract real billing unit + operation pricing
3. **Next:** Recalculate Tier 1/2/3 costs with real numbers
4. **Final:** Update `03_tech_decisions.md` with validated cost model

---

## 7. Resolution (To Be Filled)

**Actual billing model discovered:**
*[To be filled after research]*

**Real monthly costs:**
| Tier | Monthly Cost (USD) | Monthly Cost (THB) |
| --- | --- | --- |
| Tier 1 | TBD | TBD |
| Tier 2 | TBD | TBD |
| Tier 3 | TBD | TBD |

**Decision:** Keep AWS Rekognition OR switch to alternative?
*[To be filled after analysis]*

---

**Last updated:** 2025-12-01
