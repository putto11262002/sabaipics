# AWS Rekognition Face Embedding Export Research

**Research Date:** December 3, 2025
**Question:** Can AWS Rekognition return or export face embeddings/vectors?

---

## Executive Summary

**NO** - AWS Rekognition does **not** expose or allow export of face embeddings/vectors. The face feature vectors are proprietary and stored internally in AWS-managed collections as an opaque "black box."

---

## Key Findings

### 1. Does AWS Rekognition return face embeddings when you call IndexFaces?

**NO** - IndexFaces does not return the actual face embedding/vector data.

**What IndexFaces returns:**

- `FaceId` - A unique identifier (UUID format: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
- `ImageId` - Identifier for the input image
- `ExternalImageId` - Optional user-assigned identifier
- `BoundingBox` - Face location coordinates
- `Confidence` - Detection confidence score (0-100)
- `FaceDetail` - Facial attributes (age range, emotions, landmarks, pose, quality, etc.)
- `FaceModelVersion` - Version of the face detection model used

**What IndexFaces does NOT return:**

- Face embedding/feature vector
- Any numerical representation of the face that could be used for comparison outside of Rekognition

### 2. Can you retrieve/export embeddings from a Rekognition collection?

**NO** - There is no API operation to retrieve the actual face embeddings from a collection.

Available operations for retrieving face data:

- **ListFaces** - Returns metadata only (FaceId, ImageId, ExternalImageId, BoundingBox, Confidence, UserId)
- **DescribeCollection** - Returns collection-level metadata (face count, model version, ARN)

Neither operation exposes the underlying feature vectors.

### 3. What data does IndexFaces return? (Exact Response Shape)

```json
{
  "FaceRecords": [
    {
      "Face": {
        "FaceId": "string",
        "BoundingBox": {
          "Width": float,
          "Height": float,
          "Left": float,
          "Top": float
        },
        "ImageId": "string",
        "ExternalImageId": "string",
        "Confidence": float,
        "IndexFacesModelVersion": "string",
        "UserId": "string"
      },
      "FaceDetail": {
        "BoundingBox": { ... },
        "AgeRange": { "Low": int, "High": int },
        "Smile": { "Value": boolean, "Confidence": float },
        "Eyeglasses": { "Value": boolean, "Confidence": float },
        "Sunglasses": { "Value": boolean, "Confidence": float },
        "Gender": { "Value": "Male"|"Female", "Confidence": float },
        "Beard": { "Value": boolean, "Confidence": float },
        "Mustache": { "Value": boolean, "Confidence": float },
        "EyesOpen": { "Value": boolean, "Confidence": float },
        "MouthOpen": { "Value": boolean, "Confidence": float },
        "Emotions": [ ... ],
        "Landmarks": [ ... ],
        "Pose": { ... },
        "Quality": { ... },
        "Confidence": float,
        "FaceOccluded": { ... },
        "EyeDirection": { ... }
      }
    }
  ],
  "OrientationCorrection": "ROTATE_0|ROTATE_90|ROTATE_180|ROTATE_270",
  "FaceModelVersion": "string",
  "UnindexedFaces": [ ... ]
}
```

**Note:** The actual face embedding vector is extracted by the algorithm but **never returned to the user**. It is stored internally in AWS's backend database.

### 4. What data does SearchFacesByImage return? (Exact Response Shape)

```json
{
  "SearchedFaceBoundingBox": {
    "Width": float,
    "Height": float,
    "Left": float,
    "Top": float
  },
  "SearchedFaceConfidence": float,
  "FaceMatches": [
    {
      "Similarity": float,
      "Face": {
        "FaceId": "string",
        "BoundingBox": { ... },
        "ImageId": "string",
        "ExternalImageId": "string",
        "Confidence": float,
        "IndexFacesModelVersion": "string",
        "UserId": "string"
      }
    }
  ],
  "FaceModelVersion": "string"
}
```

**Key observations:**

- Returns a **similarity score** (0-100 float) for matches
- Returns metadata about matched faces
- Does **NOT** return embeddings for either the query face or matched faces

### 5. Is there any way to get the actual vector/embedding data?

**NO** - According to AWS documentation:

> "Amazon Rekognition doesn't save the actual faces that are detected. Instead, the underlying detection algorithm first detects the faces in the input image. For each face, the algorithm extracts facial features into a feature vector, and stores it in the backend database."

The feature vectors are:

- Stored in AWS-managed backend databases
- Not accessible via any API operation
- Used internally for face matching operations (SearchFaces, SearchFacesByImage)
- Proprietary to AWS Rekognition

---

## Implications for Vendor Lock-in

### Cannot Migrate Data

- Face embeddings stored in Rekognition collections cannot be exported
- If you switch to another face recognition provider (e.g., FaceNet, DeepFace, custom model), you must re-index all faces
- No way to bulk export face vectors for backup or portability

### Cannot Use Embeddings Elsewhere

- Cannot use Rekognition-generated embeddings in your own similarity calculations
- Cannot combine Rekognition embeddings with other systems
- All face comparison operations must go through Rekognition APIs

### Dependency on AWS

- Complete dependency on AWS for all face recognition operations
- Subject to AWS pricing changes
- Subject to AWS service availability
- Cannot move to on-premise or alternative providers without complete re-indexing

---

## Alternative Approaches

If embedding portability is important, consider:

1. **Open-source face recognition models:**
   - FaceNet (Google)
   - ArcFace / CosFace
   - DeepFace (Meta)
   - InsightFace
   - OpenFace

2. **Self-hosted solutions:**
   - Host your own face recognition model (TensorFlow, PyTorch)
   - Store embeddings in your own database (PostgreSQL with pgvector, Pinecone, Milvus, etc.)
   - Full control over data portability

3. **Hybrid approach:**
   - Use Rekognition for initial prototyping/validation
   - Plan migration path to self-hosted solution before scaling
   - Accept vendor lock-in as trade-off for managed service convenience

---

## Sources

1. **AWS Rekognition IndexFaces API Reference**
   https://docs.aws.amazon.com/rekognition/latest/APIReference/API_IndexFaces.html

2. **AWS Rekognition SearchFacesByImage API Reference**
   https://docs.aws.amazon.com/rekognition/latest/APIReference/API_SearchFacesByImage.html

3. **AWS Rekognition Face Data Type**
   https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Face.html

4. **AWS Rekognition FaceRecord Data Type**
   https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FaceRecord.html

5. **AWS Rekognition Managing Face Collections**
   https://docs.aws.amazon.com/rekognition/latest/dg/managing-face-collections.html

---

## Recommendation

**For FaceLink project:** Given that AWS Rekognition does not allow embedding export and creates vendor lock-in, we should seriously consider self-hosted alternatives if:

- We anticipate high scale (cost becomes prohibitive with Rekognition)
- Data portability is important
- We want to avoid dependency on a single vendor

**Mitigation if using Rekognition:**

- Store `ExternalImageId` mapping to original photos for re-indexing capability
- Keep original photos accessible for potential migration
- Document the vendor lock-in risk in technical decisions
