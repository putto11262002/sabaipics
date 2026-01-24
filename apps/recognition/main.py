"""
DeepFace Recognition Service - SabaiFace API Compatible

A face recognition service using DeepFace with ArcFace embeddings,
exposing an API compatible with the SabaiFace/AWS Rekognition interface.
"""

import os
import uuid
import base64
from io import BytesIO
from typing import Optional
from collections import defaultdict

import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from deepface import DeepFace

# =============================================================================
# Configuration
# =============================================================================

MODEL_NAME = os.getenv("MODEL_NAME", "ArcFace")  # ArcFace, Facenet512, VGG-Face
DETECTOR_BACKEND = os.getenv(
    "DETECTOR_BACKEND", "retinaface"
)  # retinaface, mtcnn, opencv, ssd
DISTANCE_METRIC = os.getenv(
    "DISTANCE_METRIC", "cosine"
)  # cosine, euclidean, euclidean_l2
MIN_CONFIDENCE = float(os.getenv("MIN_CONFIDENCE", "0.5"))
MAX_FACES_PER_IMAGE = int(os.getenv("MAX_FACES_PER_IMAGE", "100"))

# =============================================================================
# In-Memory Storage
# =============================================================================

# collections[collection_id] = {
#     "faces": [
#         {"face_id": str, "external_image_id": str, "embedding": np.array, "bbox": dict}
#     ]
# }
collections: dict = {}

# =============================================================================
# API Models (SabaiFace/AWS Rekognition Compatible)
# =============================================================================


class ImageData(BaseModel):
    Bytes: str  # Base64 encoded image


class CreateCollectionRequest(BaseModel):
    CollectionId: str


class IndexFacesRequest(BaseModel):
    Image: ImageData
    ExternalImageId: str
    MaxFaces: Optional[int] = 100
    QualityFilter: Optional[str] = "AUTO"


class SearchFacesByImageRequest(BaseModel):
    Image: ImageData
    MaxFaces: Optional[int] = 20
    FaceMatchThreshold: Optional[float] = 80.0  # 0-100 scale


# =============================================================================
# Helper Functions
# =============================================================================


def decode_image(base64_str: str) -> np.ndarray:
    """Decode base64 image to numpy array (RGB)."""
    image_bytes = base64.b64decode(base64_str)
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    return np.array(image)


def extract_faces(img_array: np.ndarray, max_faces: int = 100) -> list:
    """Extract faces and embeddings from image using DeepFace."""
    try:
        # Use represent to get embeddings + face regions
        results = DeepFace.represent(
            img_path=img_array,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False,
            align=True,
        )

        # Filter by confidence and limit
        faces = []
        for r in results[:max_faces]:
            # DeepFace returns confidence as 'face_confidence'
            confidence = r.get("face_confidence", 1.0)
            if confidence >= MIN_CONFIDENCE:
                faces.append(
                    {
                        "embedding": np.array(r["embedding"]),
                        "bbox": r.get("facial_area", {}),
                        "confidence": confidence,
                    }
                )
        return faces
    except Exception as e:
        print(f"[DeepFace] Face extraction error: {e}")
        return []


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors (0-1 scale)."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def to_aws_bbox(bbox: dict, img_width: int, img_height: int) -> dict:
    """Convert pixel bbox to AWS-style relative bbox."""
    x = bbox.get("x", 0)
    y = bbox.get("y", 0)
    w = bbox.get("w", 0)
    h = bbox.get("h", 0)
    return {
        "Width": w / img_width if img_width > 0 else 0,
        "Height": h / img_height if img_height > 0 else 0,
        "Left": x / img_width if img_width > 0 else 0,
        "Top": y / img_height if img_height > 0 else 0,
    }


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(title="DeepFace Recognition Service", version="1.0.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "deepface-recognition",
        "model": MODEL_NAME,
        "detector": DETECTOR_BACKEND,
    }


@app.post("/collections")
def create_collection(request: CreateCollectionRequest):
    collection_id = request.CollectionId
    if collection_id in collections:
        raise HTTPException(status_code=400, detail="Collection already exists")

    collections[collection_id] = {"faces": []}
    return {
        "StatusCode": 200,
        "CollectionArn": f"deepface:{collection_id}",
        "FaceModelVersion": f"deepface-{MODEL_NAME}",
    }


@app.delete("/collections/{collection_id}")
def delete_collection(collection_id: str):
    if collection_id not in collections:
        raise HTTPException(
            status_code=404,
            detail={
                "__type": "ResourceNotFoundException",
                "message": "Collection not found",
            },
        )

    del collections[collection_id]
    return {"StatusCode": 200}


@app.post("/collections/{collection_id}/index-faces")
def index_faces(collection_id: str, request: IndexFacesRequest):
    if collection_id not in collections:
        raise HTTPException(
            status_code=404,
            detail={
                "__type": "ResourceNotFoundException",
                "message": "Collection not found",
            },
        )

    # Decode image
    img_array = decode_image(request.Image.Bytes)
    img_height, img_width = img_array.shape[:2]

    # Extract faces
    max_faces = min(request.MaxFaces or 100, MAX_FACES_PER_IMAGE)
    faces = extract_faces(img_array, max_faces)

    # Store faces
    face_records = []
    for face in faces:
        face_id = str(uuid.uuid4())
        collections[collection_id]["faces"].append(
            {
                "face_id": face_id,
                "external_image_id": request.ExternalImageId,
                "embedding": face["embedding"],
                "bbox": face["bbox"],
                "confidence": face["confidence"],
            }
        )

        bbox = to_aws_bbox(face["bbox"], img_width, img_height)
        face_records.append(
            {
                "Face": {
                    "FaceId": face_id,
                    "BoundingBox": bbox,
                    "ExternalImageId": request.ExternalImageId,
                    "Confidence": face["confidence"] * 100,
                },
                "FaceDetail": {
                    "BoundingBox": bbox,
                    "Confidence": face["confidence"] * 100,
                },
            }
        )

    return {
        "FaceRecords": face_records,
        "UnindexedFaces": [],
        "FaceModelVersion": f"deepface-{MODEL_NAME}",
    }


@app.post("/collections/{collection_id}/search-faces-by-image")
def search_faces_by_image(collection_id: str, request: SearchFacesByImageRequest):
    if collection_id not in collections:
        raise HTTPException(
            status_code=404,
            detail={
                "__type": "ResourceNotFoundException",
                "message": "Collection not found",
            },
        )

    # Decode query image
    img_array = decode_image(request.Image.Bytes)
    img_height, img_width = img_array.shape[:2]

    # Extract query face (just first one)
    query_faces = extract_faces(img_array, max_faces=1)
    if not query_faces:
        return {
            "SearchedFaceBoundingBox": {},
            "SearchedFaceConfidence": 0,
            "FaceMatches": [],
            "FaceModelVersion": f"deepface-{MODEL_NAME}",
        }

    query_face = query_faces[0]
    query_embedding = query_face["embedding"]

    # Search for matches
    threshold = (request.FaceMatchThreshold or 80.0) / 100.0  # Convert to 0-1
    stored_faces = collections[collection_id]["faces"]
    
    matches = []
    for stored in stored_faces:
        similarity = cosine_similarity(query_embedding, np.array(stored["embedding"]))
        if similarity >= threshold:
            matches.append({
                "Similarity": similarity * 100,  # Convert to 0-100
                "Face": {
                    "FaceId": stored["face_id"],
                    "ExternalImageId": stored["external_image_id"],
                    "Confidence": stored["confidence"] * 100,
                },
            })
    
    # Sort by similarity descending and limit
    matches.sort(key=lambda x: x["Similarity"], reverse=True)
    max_results = request.MaxFaces or 20
    matches = matches[:max_results]
    
    query_bbox = to_aws_bbox(query_face["bbox"], img_width, img_height)
    
    return {
        "SearchedFaceBoundingBox": query_bbox,
        "SearchedFaceConfidence": query_face["confidence"] * 100,
        "FaceMatches": matches,
        "FaceModelVersion": f"deepface-{MODEL_NAME}",
    }
            )

    # Sort by similarity descending and limit
    matches.sort(key=lambda x: x["Similarity"], reverse=True)
    max_results = request.MaxFaces or 20
    matches = matches[:max_results]

    query_bbox = to_aws_bbox(query_face["bbox"], img_width, img_height)

    return {
        "SearchedFaceBoundingBox": query_bbox,
        "SearchedFaceConfidence": query_face["confidence"] * 100,
        "FaceMatches": matches,
        "FaceModelVersion": f"deepface-{MODEL_NAME}",
    }


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8087"))
    print(f"Starting DeepFace Recognition Service on port {port}")
    print(f"Model: {MODEL_NAME}, Detector: {DETECTOR_BACKEND}")
    uvicorn.run(app, host="0.0.0.0", port=port)
