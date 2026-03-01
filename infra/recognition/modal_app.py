"""
FrameFast Recognition Service — Modal Deployment

Stateless face extraction: image in → embeddings out.
Runs on Modal with GPU (T4) for fast inference.

Deploy:  modal deploy infra/recognition/modal_app.py
Serve:   modal serve infra/recognition/modal_app.py  (dev, auto-reload)
"""

import modal

# =============================================================================
# Modal App + Image
# =============================================================================

app = modal.App(name="framefast-recognition")


def download_model():
    """Pre-download InsightFace buffalo_l during image build.

    Bakes model weights (~200 MB) into the container image,
    eliminating model download on cold start.
    """
    from insightface.app import FaceAnalysis

    fa = FaceAnalysis(
        name="buffalo_l",
        allowed_modules=["detection", "recognition"],
    )
    fa.prepare(ctx_id=0, det_size=(640, 640))


image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11"
    )
    .run_commands(
        "apt-get update",
        # clang needed to compile insightface C++ extension
        # --allow-change-held-packages needed because CUDA base image holds certain packages
        "apt-get install -y --allow-change-held-packages "
        "libgl1 libglib2.0-0 clang",
    )
    .pip_install(
        "insightface>=0.7.3",
        "onnxruntime-gpu>=1.17.0",
        "opencv-python-headless>=4.9.0",
        "numpy>=1.26.0",
        "pillow>=10.0.0",
        "fastapi>=0.128.0",
        "python-multipart>=0.0.21",
        "httpx>=0.28.0",
    )
    .run_function(download_model, gpu="T4")
)

# =============================================================================
# FastAPI app factory — all heavy imports are deferred to container runtime
# =============================================================================

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_FACES_PER_IMAGE = 100
MIN_CONFIDENCE = 0.5


def create_web_app():
    """Create the FastAPI app. Called once per container inside Modal."""
    import os
    import base64
    import time
    from io import BytesIO
    from typing import Optional

    import cv2
    import numpy as np
    from PIL import Image
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel

    web_app = FastAPI(title="FrameFast Recognition", version="3.0.0")

    # -------------------------------------------------------------------------
    # Model (lazy-loaded once per container)
    # -------------------------------------------------------------------------

    _face_app = None

    def get_face_app():
        nonlocal _face_app
        if _face_app is None:
            from insightface.app import FaceAnalysis

            model_pack = os.getenv("MODEL_PACK", "buffalo_l")
            det_size = int(os.getenv("DET_SIZE", "640"))
            _face_app = FaceAnalysis(
                name=model_pack,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
                allowed_modules=["detection", "recognition"],
            )
            _face_app.prepare(ctx_id=0, det_size=(det_size, det_size))
            print(f"[InsightFace] Model loaded: {model_pack} (det_size={det_size}, GPU)")
        return _face_app

    # -------------------------------------------------------------------------
    # Pydantic models
    # -------------------------------------------------------------------------

    class ExtractRequest(BaseModel):
        image: Optional[str] = None
        image_url: Optional[str] = None
        max_faces: Optional[int] = 100
        min_confidence: Optional[float] = 0.5

    class BoundingBoxResponse(BaseModel):
        x: float
        y: float
        width: float
        height: float

    class DetectedFaceResponse(BaseModel):
        embedding: list[float]
        bounding_box: BoundingBoxResponse
        confidence: float

    class ExtractResponse(BaseModel):
        faces: list[DetectedFaceResponse]
        image_width: int
        image_height: int
        model: str
        inference_ms: int

    class ErrorResponse(BaseModel):
        error: str

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def decode_base64_image(base64_str: str) -> np.ndarray:
        image_bytes = base64.b64decode(base64_str)
        pil_img = Image.open(BytesIO(image_bytes)).convert("RGB")
        del image_bytes
        rgb_array = np.array(pil_img)
        pil_img.close()
        del pil_img
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        del rgb_array
        return bgr_array

    def decode_raw_image(image_bytes: bytes) -> np.ndarray:
        pil_img = Image.open(BytesIO(image_bytes)).convert("RGB")
        rgb_array = np.array(pil_img)
        pil_img.close()
        del pil_img
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        del rgb_array
        return bgr_array

    def run_extraction(face_app, img_array: np.ndarray, max_faces: int, min_confidence: float) -> list:
        faces = face_app.get(img_array)
        faces = sorted(faces, key=lambda f: f.det_score, reverse=True)
        result = []
        for face in faces[:max_faces]:
            confidence = float(face.det_score)
            if confidence < min_confidence:
                continue
            bbox = face.bbox.astype(int)
            embedding = face.embedding.flatten().copy()
            result.append({
                "embedding": embedding,
                "bbox": {"x": int(bbox[0]), "y": int(bbox[1]), "w": int(bbox[2] - bbox[0]), "h": int(bbox[3] - bbox[1])},
                "confidence": confidence,
            })
        del faces
        return result

    # -------------------------------------------------------------------------
    # Endpoints
    # -------------------------------------------------------------------------

    @web_app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "framefast-recognition",
            "model": os.getenv("MODEL_PACK", "buffalo_l"),
            "runtime": "modal",
        }

    @web_app.post("/extract", response_model=ExtractResponse, responses={400: {"model": ErrorResponse}})
    async def extract(request: ExtractRequest):
        has_image = request.image is not None and len(request.image) > 0
        has_url = request.image_url is not None and len(request.image_url) > 0

        if has_image == has_url:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_image", "detail": "Provide exactly one of 'image' (base64) or 'image_url'"},
            )

        # Load image from URL or base64
        if has_url:
            import httpx

            try:
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                    resp = await client.get(request.image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
            except httpx.HTTPStatusError as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": "invalid_image", "detail": f"Failed to fetch: HTTP {e.response.status_code}"},
                )
            except Exception:
                return JSONResponse(status_code=400, content={"error": "invalid_image", "detail": "Failed to fetch image_url"})

            if len(image_bytes) > MAX_IMAGE_BYTES:
                return JSONResponse(status_code=400, content={"error": "image_too_large"})

            try:
                img_array = decode_raw_image(image_bytes)
            except Exception:
                return JSONResponse(status_code=400, content={"error": "invalid_image"})
            finally:
                del image_bytes
        else:
            estimated_bytes = len(request.image) * 3 // 4
            if estimated_bytes > MAX_IMAGE_BYTES:
                return JSONResponse(status_code=400, content={"error": "image_too_large"})

            try:
                img_array = decode_base64_image(request.image)
            except Exception:
                return JSONResponse(status_code=400, content={"error": "invalid_image"})

        img_height, img_width = img_array.shape[:2]

        # Extract faces
        max_faces = min(request.max_faces or 100, MAX_FACES_PER_IMAGE)
        min_conf = request.min_confidence if request.min_confidence is not None else MIN_CONFIDENCE

        fa = get_face_app()
        start_ms = time.time()
        faces = run_extraction(fa, img_array, max_faces, min_conf)
        inference_ms = int((time.time() - start_ms) * 1000)
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
            model=os.getenv("MODEL_PACK", "buffalo_l"),
            inference_ms=inference_ms,
        )

    return web_app


# =============================================================================
# Modal Function
# =============================================================================


@app.function(
    image=image,
    gpu="T4",
    region="us",
    scaledown_window=120,
    max_containers=5,
)
@modal.concurrent(max_inputs=4, target_inputs=2)
@modal.asgi_app(requires_proxy_auth=True)
def serve():
    return create_web_app()
