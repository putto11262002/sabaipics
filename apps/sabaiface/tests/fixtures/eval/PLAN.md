# Evaluation Implementation Plan

## Current State

- Detection dataset: 15 images (001-015.jpg) with labels.json
- Kaggle dataset: 747 images, 6 people (10002-10007 folders)

## Kaggle Dataset for Detection

### Ground Truth Format

`ground.npy` (2 columns):
- Col 1: `face_id` = image name + face index (e.g., "GE3A1048_0")
- Col 2: `person_id` = identity (or -1 for unknown)

### Detection Label Extraction

Parse `face_id` column:
- Extract image name (part before underscore)
- Count occurrences per image = face count

Example:
```
"GE3A1048_0" → image: GE3A1048, face: #0
"GE3A1048_1" → image: GE3A1048, face: #1
"GE3A1048_2" → image: GE3A1048, face: #2
→ Image GE3A1048 has 3 faces
```

### Integration Approach

1. Parse all `*/ground.npy` files
2. Extract unique images and count faces
3. Generate `labels.json` format:
   ```json
   {
     "image": "GE3A1048.jpg",
     "faceCount": 3,
     "category": "multiple",
     "source": "kaggle"
   }
   ```
4. Copy/rename images to flat structure (sequential numbering)

## Recognition (Next Phase)

### Key Finding: Pre-Cropped Faces!

**NO bounding box coordinates available**. Instead, dataset provides:

**output.npz** contents:
| Key | Shape | Description |
|-----|-------|-------------|
| `data_face_img` | (N, 160, 160, 3) | **Pre-cropped face images** |
| `data_e` | (N, 128) | FaceNet embeddings |
| `data_face_e_2` | (N, 128) | Dlib embeddings |
| `data_e_vgg` | (N, 512) | VGG-Face embeddings |
| `data_ori_imgid` | (N,) | Original image ID for each face |
| `data_faceid` | (N,) | Face ID (matches ground.npy) |

**Recognition strategy**:
1. Use pre-cropped 160x160 faces directly (no cropping needed)
2. Chronological split by `data_ori_imgid`: 80% index, 20% query
3. Use pre-computed embeddings OR re-compute with our model

### Ground Truth Format

```json
{
  "identities": {
    "94089422": {
      "name": "Person 94089422",
      "faceIndices": [0, 5, 10],
      "originalImages": ["1", "2", "IMG_8836"]
    }
  },
  "splits": {
    "index": [0, 1, 2, 3, 4, 5, 6, 7],
    "query": [8, 9, 10]
  },
  "test_queries": [
    {
      "queryIndex": 8,
      "expected_person_id": 94089422,
      "expected_matches": [0, 5, 10]
    }
  ]
}
```

### Test Cases
- Same person matching: Does face A match face B of same person?
- Cross-person rejection: Does face A correctly NOT match different person?
- Rank accuracy: Is correct match in top K results?
- Embedding comparison: Our model vs pre-computed facenet/dlib/vgg

## Implementation Order

1. ✅ Detection dataset (current 15 images)
2. ⏳ Kaggle detection labels (parse ground.npy → labels.json)
3. ⏳ Recognition setup (extract pre-cropped faces to dataset/recognition/)
4. ⏳ Recognition evaluation scripts
