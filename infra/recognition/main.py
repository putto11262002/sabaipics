"""
InsightFace Recognition Service — v2 Extraction API

Stateless face extraction service: image in → embeddings out.
No collections, no search, no state. All similarity search is done via pgvector.
"""

import os
import gc
import base64
import time
from io import BytesIO
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI
from pydantic import BaseModel
from insightface.app import FaceAnalysis

# =============================================================================
# Configuration
# =============================================================================

MODEL_PACK = os.getenv("MODEL_PACK", "buffalo_l")  # buffalo_l, buffalo_s, buffalo_sc
DET_SIZE = int(os.getenv("DET_SIZE", "640"))  # Detection input size
MIN_CONFIDENCE = float(os.getenv("MIN_CONFIDENCE", "0.5"))
MAX_FACES_PER_IMAGE = int(os.getenv("MAX_FACES_PER_IMAGE", "100"))
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))  # 10 MB
# Recreate ONNX sessions every N inferences to release leaked memory
SESSION_RECYCLE_INTERVAL = int(os.getenv("SESSION_RECYCLE_INTERVAL", "500"))


# =============================================================================
# Model Loading with Session Recycling
# =============================================================================


class FaceAnalysisWrapper:
    """Wraps FaceAnalysis with periodic session recycling to prevent OOM.

    ONNX Runtime's CPU execution provider allocates a memory pool that grows
    but never shrinks. After ~800 inferences the process gets OOM-killed.
    This wrapper recreates the FaceAnalysis instance every N inferences,
    releasing the accumulated memory.
    """

    def __init__(
        self,
        name: str,
        providers: list[str],
        det_size: tuple[int, int],
        recycle_every: int,
    ):
        self._name = name
        self._providers = providers
        self._det_size = det_size
        self._recycle_every = recycle_every
        self._call_count = 0
        self._app: FaceAnalysis | None = None
        self._load()

    def _load(self):
        start = time.time()
        self._app = FaceAnalysis(
            name=self._name,
            providers=self._providers,
            # Only load detection + recognition — skip landmarks_2d_106,
            # landmarks_3d_68, genderage (saves ~143 MB)
            allowed_modules=["detection", "recognition"],
        )
        self._app.prepare(ctx_id=0, det_size=self._det_size)
        self._call_count = 0
        elapsed = time.time() - start
        print(f"[InsightFace] Model loaded in {elapsed:.1f}s (allowed_modules=detection,recognition)")

    def get(self, img: np.ndarray) -> list:
        self._call_count += 1
        if self._call_count >= self._recycle_every:
            print(f"[InsightFace] Recycling session after {self._call_count} inferences")
            del self._app
            gc.collect()
            self._load()
        return self._app.get(img)


print(f"[InsightFace] Loading model pack: {MODEL_PACK} (det_size={DET_SIZE}, recycle_every={SESSION_RECYCLE_INTERVAL})")

face_app = FaceAnalysisWrapper(
    name=MODEL_PACK,
    providers=["CPUExecutionProvider"],
    det_size=(DET_SIZE, DET_SIZE),
    recycle_every=SESSION_RECYCLE_INTERVAL,
)

# =============================================================================
# API Models
# =============================================================================


class ExtractRequest(BaseModel):
    image: Optional[str] = None  # Base64 encoded image
    image_url: Optional[str] = None  # URL to fetch image from (e.g. R2 public URL)
    max_faces: Optional[int] = 100
    min_confidence: Optional[float] = 0.5


class BoundingBoxResponse(BaseModel):
    x: float  # 0-1 ratio
    y: float  # 0-1 ratio
    width: float  # 0-1 ratio
    height: float  # 0-1 ratio


class DetectedFaceResponse(BaseModel):
    embedding: list[float]  # 512-D ArcFace
    bounding_box: BoundingBoxResponse
    confidence: float  # 0-1


class ExtractResponse(BaseModel):
    faces: list[DetectedFaceResponse]
    image_width: int
    image_height: int
    model: str
    inference_ms: int


class ErrorResponse(BaseModel):
    error: str


# =============================================================================
# Helper Functions
# =============================================================================


def decode_image(base64_str: str) -> np.ndarray:
    """Decode base64 image to numpy array (BGR for OpenCV/InsightFace).

    Explicitly frees intermediates to avoid holding multiple copies of the
    image in memory (base64 string, raw bytes, PIL Image, RGB array).
    """
    image_bytes = base64.b64decode(base64_str)
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    del image_bytes  # free raw bytes (~1-5 MB per image)
    rgb_array = np.array(image)
    image.close()
    del image  # free PIL image
    bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
    del rgb_array  # free RGB copy
    return bgr_array


def extract_faces(img_array: np.ndarray, max_faces: int = 100, min_confidence: float = 0.5) -> list:
    """Extract faces and embeddings from image using InsightFace.

    Copies embeddings to plain numpy arrays and deletes the raw InsightFace
    face objects to release any ONNX-internal memory references.

    Returns list of dicts with embedding, bbox (pixel coords), confidence.
    """
    try:
        faces = face_app.get(img_array)

        # Sort by detection score descending, then limit
        faces = sorted(faces, key=lambda f: f.det_score, reverse=True)

        result = []
        for face in faces[:max_faces]:
            confidence = float(face.det_score)
            if confidence < min_confidence:
                continue

            # InsightFace bbox is [x1, y1, x2, y2]
            bbox = face.bbox.astype(int)
            # .copy() ensures we own the embedding data, not ONNX internals
            embedding = face.embedding.flatten().copy()
            result.append(
                {
                    "embedding": embedding,
                    "bbox": {
                        "x": int(bbox[0]),
                        "y": int(bbox[1]),
                        "w": int(bbox[2] - bbox[0]),
                        "h": int(bbox[3] - bbox[1]),
                    },
                    "confidence": confidence,
                }
            )

        # Release InsightFace face objects (may hold ONNX memory references)
        del faces

        return result
    except Exception as e:
        print(f"[InsightFace] Face extraction error: {e}")
        return []


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(title="InsightFace Recognition Service", version="3.0.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "insightface-recognition",
        "model": MODEL_PACK,
        "det_size": DET_SIZE,
    }


@app.post("/extract", response_model=ExtractResponse, responses={400: {"model": ErrorResponse}})
async def extract(request: ExtractRequest):
    from fastapi.responses import JSONResponse

    # Validate: exactly one of image or image_url
    has_image = request.image is not None and len(request.image) > 0
    has_url = request.image_url is not None and len(request.image_url) > 0

    if has_image == has_url:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_image", "detail": "Provide exactly one of 'image' (base64) or 'image_url'"},
        )

    if has_url:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(request.image_url)
                resp.raise_for_status()
                image_bytes = resp.content
        except Exception:
            return JSONResponse(status_code=400, content={"error": "invalid_image", "detail": "Failed to fetch image_url"})

        if len(image_bytes) > MAX_IMAGE_BYTES:
            return JSONResponse(status_code=400, content={"error": "image_too_large"})

        try:
            pil_img = Image.open(BytesIO(image_bytes)).convert("RGB")
            del image_bytes
            rgb_array = np.array(pil_img)
            pil_img.close()
            del pil_img
            img_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
            del rgb_array
        except Exception:
            return JSONResponse(status_code=400, content={"error": "invalid_image"})
    else:
        # Base64 path
        estimated_bytes = len(request.image) * 3 // 4
        if estimated_bytes > MAX_IMAGE_BYTES:
            return JSONResponse(status_code=400, content={"error": "image_too_large"})

        try:
            img_array = decode_image(request.image)
        except Exception:
            return JSONResponse(status_code=400, content={"error": "invalid_image"})


    img_height, img_width = img_array.shape[:2]

    # Extract faces
    max_faces = min(request.max_faces or 100, MAX_FACES_PER_IMAGE)
    min_conf = request.min_confidence if request.min_confidence is not None else MIN_CONFIDENCE

    start_ms = time.time()
    faces = extract_faces(img_array, max_faces, min_conf)
    inference_ms = int((time.time() - start_ms) * 1000)

    # Free image array
    del img_array

    # Convert bounding boxes to 0-1 ratios
    response_faces = []
    for face in faces:
        bbox = face["bbox"]
        response_faces.append(
            DetectedFaceResponse(
                embedding=face["embedding"].tolist(),
                bounding_box=BoundingBoxResponse(
                    x=bbox["x"] / img_width if img_width > 0 else 0,
                    y=bbox["y"] / img_height if img_height > 0 else 0,
                    width=bbox["w"] / img_width if img_width > 0 else 0,
                    height=bbox["h"] / img_height if img_height > 0 else 0,
                ),
                confidence=face["confidence"],
            )
        )

    return ExtractResponse(
        faces=response_faces,
        image_width=img_width,
        image_height=img_height,
        model=MODEL_PACK,
        inference_ms=inference_ms,
    )


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8087"))
    print(f"Starting InsightFace Recognition Service on port {port}")
    print(f"Model: {MODEL_PACK}, Det Size: {DET_SIZE}")
    uvicorn.run(app, host="0.0.0.0", port=port)
