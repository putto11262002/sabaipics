"""
FrameFast Recognition Service — Modal Deployment

Stateless face extraction: image in → embeddings out.
Runs on Modal with GPU (T4) for fast inference.

Deploy:  modal deploy infra/recognition/modal_app.py
Serve:   modal serve infra/recognition/modal_app.py  (dev, auto-reload)
"""

import modal

_OBSERVABILITY_READY = False

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
        "opentelemetry-api>=1.36.0",
        "opentelemetry-sdk>=1.36.0",
        "opentelemetry-exporter-otlp-proto-http>=1.36.0",
        "opentelemetry-instrumentation-fastapi>=0.57b0",
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
    from opentelemetry import metrics, trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter

    web_app = FastAPI(title="FrameFast Recognition", version="3.0.0")
    tracer = trace.get_tracer("framefast-recognition", "3.0.0")
    meter = metrics.get_meter("framefast-recognition", "3.0.0")
    request_counter = None
    error_counter = None
    request_latency_ms = None
    inference_latency_ms = None
    face_count_histogram = None

    def resolve_otlp_endpoint(raw: str, signal: str) -> str:
        normalized = raw.strip().rstrip("/")
        if normalized.endswith(f"/v1/{signal}"):
            return normalized
        if normalized.endswith("/otlp"):
            return f"{normalized}/v1/{signal}"
        if normalized.endswith("/tempo"):
            return f"{normalized[:-len('/tempo')]}/otlp/v1/{signal}"
        return f"{normalized}/v1/{signal}"

    def maybe_setup_observability():
        nonlocal tracer
        nonlocal meter
        nonlocal request_counter
        nonlocal error_counter
        nonlocal request_latency_ms
        nonlocal inference_latency_ms
        nonlocal face_count_histogram
        global _OBSERVABILITY_READY
        if _OBSERVABILITY_READY:
            return

        traces_url_raw = os.getenv("GRAFANA_OTLP_TRACES_URL", "").strip()
        traces_user = os.getenv("OTLP_TRACES_USER", "").strip()
        traces_token = os.getenv("OTLP_TRACES_TOKEN", "").strip()
        trace_sample_ratio_raw = os.getenv("OTEL_TRACE_SAMPLE_RATIO", "").strip()
        metrics_url_raw = os.getenv("GRAFANA_OTLP_METRICS_URL", "").strip() or traces_url_raw
        metrics_user = os.getenv("OTLP_METRICS_USER", "").strip() or traces_user
        metrics_token = os.getenv("OTLP_METRICS_TOKEN", "").strip() or traces_token

        if not traces_url_raw or not traces_user or not traces_token:
            print("[otel] tracing exporter disabled (missing traces env vars)")
            return

        env_name = os.getenv("NODE_ENV", os.getenv("ENVIRONMENT", "production"))
        default_ratio = 1.0 if env_name == "development" else (0.6 if env_name == "staging" else 0.5)
        try:
            trace_sample_ratio = float(trace_sample_ratio_raw) if trace_sample_ratio_raw else default_ratio
        except ValueError:
            trace_sample_ratio = default_ratio
        trace_sample_ratio = max(0.0, min(1.0, trace_sample_ratio))
        resource = Resource.create(
            {
                "service.name": "framefast-recognition",
                "service.version": "3.0.0",
                "service.namespace": "framefast",
                "deployment.environment": env_name,
            }
        )

        auth_header = base64.b64encode(f"{traces_user}:{traces_token}".encode("utf-8")).decode("utf-8")
        trace_provider = TracerProvider(
            resource=resource,
            sampler=ParentBased(TraceIdRatioBased(trace_sample_ratio)),
        )
        trace_provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(
                    endpoint=resolve_otlp_endpoint(traces_url_raw, "traces"),
                    headers={"Authorization": f"Basic {auth_header}"},
                )
            )
        )
        trace.set_tracer_provider(trace_provider)
        tracer = trace.get_tracer("framefast-recognition", "3.0.0")

        if metrics_url_raw and metrics_user and metrics_token:
            metrics_auth_header = base64.b64encode(f"{metrics_user}:{metrics_token}".encode("utf-8")).decode("utf-8")
            meter_provider = MeterProvider(
                resource=resource,
                metric_readers=[
                    PeriodicExportingMetricReader(
                        OTLPMetricExporter(
                            endpoint=resolve_otlp_endpoint(metrics_url_raw, "metrics"),
                            headers={"Authorization": f"Basic {metrics_auth_header}"},
                        ),
                        export_interval_millis=10000,
                    )
                ],
            )
            metrics.set_meter_provider(meter_provider)
            meter = metrics.get_meter("framefast-recognition", "3.0.0")
        else:
            print("[otel] metrics exporter disabled (missing metrics env vars)")

        request_counter = meter.create_counter(
            "framefast_recognition_requests_total",
            unit="1",
            description="Total number of recognition requests",
        )
        error_counter = meter.create_counter(
            "framefast_recognition_errors_total",
            unit="1",
            description="Total number of recognition request errors",
        )
        request_latency_ms = meter.create_histogram(
            "framefast_recognition_request_latency_ms",
            unit="ms",
            description="End-to-end request latency in milliseconds",
        )
        inference_latency_ms = meter.create_histogram(
            "framefast_recognition_inference_latency_ms",
            unit="ms",
            description="Face extraction inference latency in milliseconds",
        )
        face_count_histogram = meter.create_histogram(
            "framefast_recognition_faces_detected",
            unit="1",
            description="Number of faces detected per request",
        )

        FastAPIInstrumentor.instrument_app(web_app)
        _OBSERVABILITY_READY = True
        print("[otel] tracing and metrics configured")

    maybe_setup_observability()

    # -------------------------------------------------------------------------
    # Model (eager-loaded once per container with CUDA warmup)
    # -------------------------------------------------------------------------

    def _init_face_app():
        from insightface.app import FaceAnalysis

        model_pack = os.getenv("MODEL_PACK", "buffalo_l")
        det_size = int(os.getenv("DET_SIZE", "640"))
        fa = FaceAnalysis(
            name=model_pack,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            allowed_modules=["detection", "recognition"],
        )
        fa.prepare(ctx_id=0, det_size=(det_size, det_size))

        # Warmup: run a dummy inference to prime the CUDA pipeline
        dummy = np.zeros((det_size, det_size, 3), dtype=np.uint8)
        fa.get(dummy)

        print(f"[InsightFace] Model loaded + warmed up: {model_pack} (det_size={det_size}, GPU)")
        return fa

    _face_app = _init_face_app()

    def get_face_app():
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
        request_start = time.time()

        def record_metrics(status: str, source: str, inference_ms: int | None = None, faces: int | None = None):
            attrs = {"route": "/extract", "status": status, "source": source}
            elapsed_ms = (time.time() - request_start) * 1000
            if request_counter is not None:
                request_counter.add(1, attrs)
            if request_latency_ms is not None:
                request_latency_ms.record(elapsed_ms, attrs)
            if status != "ok" and error_counter is not None:
                error_counter.add(1, attrs)
            if inference_ms is not None and inference_latency_ms is not None:
                inference_latency_ms.record(inference_ms, attrs)
            if faces is not None and face_count_histogram is not None:
                face_count_histogram.record(faces, attrs)

        has_image = request.image is not None and len(request.image) > 0
        has_url = request.image_url is not None and len(request.image_url) > 0

        if has_image == has_url:
            record_metrics("validation_error", "unknown")
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_image", "detail": "Provide exactly one of 'image' (base64) or 'image_url'"},
            )

        # Load image from URL or base64
        source = "url" if has_url else "base64"
        if has_url:
            import httpx

            try:
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                    resp = await client.get(request.image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
            except httpx.HTTPStatusError as e:
                record_metrics("fetch_error", source)
                return JSONResponse(
                    status_code=400,
                    content={"error": "invalid_image", "detail": f"Failed to fetch: HTTP {e.response.status_code}"},
                )
            except Exception:
                record_metrics("fetch_error", source)
                return JSONResponse(status_code=400, content={"error": "invalid_image", "detail": "Failed to fetch image_url"})

            if len(image_bytes) > MAX_IMAGE_BYTES:
                record_metrics("too_large", source)
                return JSONResponse(status_code=400, content={"error": "image_too_large"})

            try:
                img_array = decode_raw_image(image_bytes)
            except Exception:
                record_metrics("decode_error", source)
                return JSONResponse(status_code=400, content={"error": "invalid_image"})
            finally:
                del image_bytes
        else:
            estimated_bytes = len(request.image) * 3 // 4
            if estimated_bytes > MAX_IMAGE_BYTES:
                record_metrics("too_large", source)
                return JSONResponse(status_code=400, content={"error": "image_too_large"})

            try:
                img_array = decode_base64_image(request.image)
            except Exception:
                record_metrics("decode_error", source)
                return JSONResponse(status_code=400, content={"error": "invalid_image"})

        img_height, img_width = img_array.shape[:2]

        # Extract faces
        max_faces = min(request.max_faces or 100, MAX_FACES_PER_IMAGE)
        min_conf = request.min_confidence if request.min_confidence is not None else MIN_CONFIDENCE

        fa = get_face_app()
        with tracer.start_as_current_span("recognition.inference") as span:
            span.set_attribute("framefast.recognition.max_faces", max_faces)
            span.set_attribute("framefast.recognition.min_confidence", float(min_conf))
            span.set_attribute("framefast.recognition.source", source)
            start_ms = time.time()
            faces = run_extraction(fa, img_array, max_faces, min_conf)
            inference_ms = int((time.time() - start_ms) * 1000)
            span.set_attribute("framefast.recognition.inference_ms", inference_ms)
            span.set_attribute("framefast.recognition.faces_detected", len(faces))
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

        record_metrics("ok", source, inference_ms=inference_ms, faces=len(response_faces))
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
    secrets=[modal.Secret.from_name("framefast-observability")],
)
@modal.concurrent(max_inputs=4, target_inputs=2)
@modal.asgi_app(requires_proxy_auth=True)
def serve():
    return create_web_app()
