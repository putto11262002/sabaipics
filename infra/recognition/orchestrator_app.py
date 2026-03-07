"""FrameFast Upload Orchestrator.

CF normalizes at the edge. Orchestrator handles auto-edit (optional) + recognition per image.
Callback is per-image.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Literal, Optional

import modal
from pydantic import BaseModel

app = modal.App("framefast-orchestrator")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi>=0.109.0",
    "httpx>=0.28.0",
    "pydantic>=2.0.0",
    "numpy>=1.26.0",
    "opentelemetry-api>=1.20.0",
    "opentelemetry-sdk>=1.20.0",
    "opentelemetry-exporter-otlp-proto-http>=1.20.0",
)


# ============================================================================
# Observability (lazy init)
# ============================================================================

_OBSERVABILITY_READY = False
_tracer = None
_tracer_provider = None
_meter = None

# Metrics (set after init)
_jobs_total = None
_step_duration = None
_batch_duration = None
_errors_total = None


def _init_observability() -> None:
    global _OBSERVABILITY_READY, _tracer, _tracer_provider, _meter
    global _jobs_total, _step_duration, _batch_duration, _errors_total

    if _OBSERVABILITY_READY:
        return

    otlp_endpoint = os.getenv("GRAFANA_OTLP_TRACES_URL", "") or os.getenv("OTLP_ENDPOINT", "")
    otlp_user = os.getenv("OTLP_TRACES_USER", "") or os.getenv("OTLP_USER", "")
    otlp_token = os.getenv("OTLP_TRACES_TOKEN", "") or os.getenv("OTLP_TOKEN", "")
    otlp_endpoint = otlp_endpoint.strip()
    otlp_user = otlp_user.strip()
    otlp_token = otlp_token.strip()
    if not otlp_endpoint or not otlp_user or not otlp_token:
        print(f"[orchestrator] OTel skipped: endpoint={'set' if otlp_endpoint else 'missing'}, user={'set' if otlp_user else 'missing'}, token={'set' if otlp_token else 'missing'}")
        _OBSERVABILITY_READY = True
        return

    try:
        from opentelemetry import trace, metrics
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.sdk.resources import Resource

        env_name = os.getenv("NODE_ENV", "production")
        sample_ratio = float(os.getenv("OTEL_TRACE_SAMPLE_RATIO", "0.5"))

        resource = Resource.create({
            "service.name": "framefast-orchestrator",
            "service.version": "3.0.0",
            "deployment.environment": env_name,
        })

        # Traces
        traces_endpoint = otlp_endpoint.rstrip("/")
        if not traces_endpoint.endswith("/v1/traces"):
            traces_endpoint = traces_endpoint + "/v1/traces"
        auth_header = f"{otlp_user}:{otlp_token}"
        import base64
        auth_b64 = base64.b64encode(auth_header.encode()).decode()

        trace_exporter = OTLPSpanExporter(
            endpoint=traces_endpoint,
            headers={"Authorization": f"Basic {auth_b64}"},
        )
        sampler = ParentBased(root=TraceIdRatioBased(sample_ratio))
        _tracer_provider = TracerProvider(resource=resource, sampler=sampler)
        _tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
        trace.set_tracer_provider(_tracer_provider)
        _tracer = trace.get_tracer("framefast-orchestrator", "3.0.0")

        # Metrics
        metrics_base = (os.getenv("GRAFANA_OTLP_METRICS_URL", "") or otlp_endpoint).strip().rstrip("/")
        metrics_user = (os.getenv("OTLP_METRICS_USER", "") or otlp_user).strip()
        metrics_token_val = (os.getenv("OTLP_METRICS_TOKEN", "") or otlp_token).strip()
        metrics_endpoint = metrics_base if metrics_base.endswith("/v1/metrics") else metrics_base + "/v1/metrics"
        metrics_auth = base64.b64encode(f"{metrics_user}:{metrics_token_val}".encode()).decode()

        metric_exporter = OTLPMetricExporter(
            endpoint=metrics_endpoint,
            headers={"Authorization": f"Basic {metrics_auth}"},
        )
        reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=15000)
        meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
        metrics.set_meter_provider(meter_provider)
        _meter = metrics.get_meter("framefast-orchestrator", "3.0.0")

        _jobs_total = _meter.create_counter(
            "framefast_orchestrator_jobs_total",
            description="Total jobs processed by orchestrator",
        )
        _step_duration = _meter.create_histogram(
            "framefast_orchestrator_step_duration_ms",
            description="Duration of orchestrator steps in ms",
            unit="ms",
        )
        _batch_duration = _meter.create_histogram(
            "framefast_orchestrator_batch_duration_ms",
            description="Duration of entire batch processing in ms",
            unit="ms",
        )
        _errors_total = _meter.create_counter(
            "framefast_orchestrator_errors_total",
            description="Total errors in orchestrator",
        )

    except Exception as e:
        print(f"[orchestrator] OTel init failed: {e}")

    _OBSERVABILITY_READY = True


def _parse_traceparent(traceparent: Optional[str]):
    """Parse W3C traceparent header into OTel SpanContext for trace continuation."""
    if not traceparent or not _tracer:
        return None

    try:
        from opentelemetry.trace import SpanContext, TraceFlags, NonRecordingSpan
        from opentelemetry.context import Context

        parts = traceparent.strip().split("-")
        if len(parts) != 4:
            return None

        trace_id = int(parts[1], 16)
        span_id = int(parts[2], 16)
        trace_flags = TraceFlags(int(parts[3], 16))

        parent_ctx = SpanContext(
            trace_id=trace_id,
            span_id=span_id,
            is_remote=True,
            trace_flags=trace_flags,
        )
        from opentelemetry import trace as trace_api
        return trace_api.set_span_in_context(NonRecordingSpan(parent_ctx))

    except Exception:
        return None


# ============================================================================
# Models
# ============================================================================


class CallbackTarget(BaseModel):
    url: str
    token: Optional[str] = None


class PipelineJobOptions(BaseModel):
    autoEdit: Optional[bool] = None
    autoEditIntensity: Optional[int] = None
    autoEditPresetId: Optional[str] = None
    contrast: Optional[float] = None
    brightness: Optional[float] = None
    saturation: Optional[float] = None
    sharpness: Optional[float] = None
    autoContrast: Optional[bool] = None
    lutId: Optional[str] = None
    lutBase64: Optional[str] = None
    lutIntensity: Optional[int] = None
    maxFaces: Optional[int] = None


class PipelineJob(BaseModel):
    jobId: str
    photoId: Optional[str] = None
    eventId: str
    photographerId: str
    source: Literal["web", "ios", "ftp"]
    inputUrl: str
    originalPutUrl: Optional[str] = None
    processedPutUrl: Optional[str] = None
    sourceR2Key: str
    originalR2Key: str
    processedR2Key: Optional[str] = None
    contentType: str
    options: Optional[PipelineJobOptions] = None


class PipelineSingleJobRequest(BaseModel):
    job: PipelineJob
    callback: CallbackTarget
    traceparent: Optional[str] = None
    baggage: Optional[str] = None


class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class DetectedFace(BaseModel):
    boundingBox: BoundingBox
    embedding: List[float]
    confidence: float


class PipelineJobArtifacts(BaseModel):
    originalR2Key: str
    processedR2Key: Optional[str] = None
    autoEditSucceeded: Optional[bool] = None
    lutApplied: Optional[bool] = None
    lutId: Optional[str] = None
    lutIntensity: Optional[int] = None
    embeddingCount: int
    faces: List[DetectedFace]
    exif: Optional[Dict[str, Any]] = None
    width: Optional[int] = None
    height: Optional[int] = None


class PipelineJobError(BaseModel):
    code: str
    message: str


class PipelineJobResult(BaseModel):
    jobId: str
    status: Literal["completed", "failed"]
    artifacts: Optional[PipelineJobArtifacts] = None
    error: Optional[PipelineJobError] = None


class PipelineCallback(BaseModel):
    results: List[PipelineJobResult]
    traceparent: Optional[str] = None
    baggage: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


async def call_image_pipeline_auto_edit(job: PipelineJob) -> Dict[str, Any]:
    """Call image pipeline for auto-edit/LUT only (normalization done at CF edge)."""
    process_fn = modal.Function.from_name("framefast-image-pipeline", "process_internal")

    output_headers = {
        "Content-Type": "image/jpeg",
    }

    opts = job.options
    options = {
        "normalize_max_px": 0,  # Skip normalization — already done at CF edge
        "auto_edit": bool(opts.autoEdit) if opts else False,
        "auto_edit_intensity": opts.autoEditIntensity if opts else 100,
        "contrast": opts.contrast if opts else None,
        "brightness": opts.brightness if opts else None,
        "saturation": opts.saturation if opts else None,
        "sharpness": opts.sharpness if opts else None,
        "auto_contrast": opts.autoContrast if opts else None,
        "lut_base64": opts.lutBase64 if opts else None,
        "lut_intensity": opts.lutIntensity if opts else 100,
        "lut_preserve_luminance": False,
    }

    result = await process_fn.remote.aio(
        input_url=job.inputUrl,
        output_url=job.processedPutUrl,
        output_headers=output_headers,
        options=options,
        processed_output_url=job.processedPutUrl,
        processed_output_headers=output_headers,
        job_id=job.jobId,
    )

    return result


async def call_recognition(job: PipelineJob) -> Dict[str, Any]:
    """Call recognition via Modal native Function.from_name()."""
    extract_fn = modal.Function.from_name("framefast-recognition", "extract_internal")

    max_faces = job.options.maxFaces if job.options and job.options.maxFaces else 100
    result = await extract_fn.remote.aio(
        image_url=job.inputUrl,
        max_faces=max_faces,
        min_confidence=0.5,
    )

    return result


async def process_single_job(job: PipelineJob) -> PipelineJobResult:
    """Process a single job: auto-edit (optional) + recognition."""
    _init_observability()

    try:
        # Auto-edit / LUT (optional) — only if enabled and processedPutUrl provided
        auto_edit_succeeded = None
        lut_applied = None
        operations_applied = []
        has_auto_edit = (
            job.options
            and (job.options.autoEdit or job.options.lutId)
            and job.processedPutUrl
        )

        if has_auto_edit:
            start = time.monotonic()
            try:
                if _tracer:
                    with _tracer.start_as_current_span("orchestrator.auto_edit", attributes={"job.id": job.jobId}):
                        image_result = await call_image_pipeline_auto_edit(job)
                else:
                    image_result = await call_image_pipeline_auto_edit(job)
                ip_duration = (time.monotonic() - start) * 1000
                if _step_duration:
                    _step_duration.record(ip_duration, {"step": "auto_edit", "status": "ok"})

                if isinstance(image_result, dict) and image_result.get("error"):
                    auto_edit_succeeded = False
                    lut_applied = False
                    if _errors_total:
                        _errors_total.add(1, {"step": "auto_edit", "code": "AUTO_EDIT_FAILED"})
                else:
                    operations_applied = image_result.get("operations_applied", []) if isinstance(image_result, dict) else []
                    auto_edit_succeeded = "auto_edit" in operations_applied
                    lut_applied = "lut" in operations_applied
            except Exception as exc:
                auto_edit_succeeded = False
                lut_applied = False
                if _errors_total:
                    _errors_total.add(1, {"step": "auto_edit", "code": "AUTO_EDIT_EXCEPTION"})
                print(f"[orchestrator] auto-edit exception job={job.jobId}: {exc}")

        # Recognition — always runs
        start = time.monotonic()
        if _tracer:
            with _tracer.start_as_current_span("orchestrator.recognition", attributes={"job.id": job.jobId}):
                recognition_result = await call_recognition(job)
        else:
            recognition_result = await call_recognition(job)
        rec_duration = (time.monotonic() - start) * 1000
        if _step_duration:
            _step_duration.record(rec_duration, {"step": "recognition", "status": "ok"})

        if isinstance(recognition_result, dict) and recognition_result.get("error"):
            if _errors_total:
                _errors_total.add(1, {"step": "recognition", "code": "RECOGNITION_FAILED"})
            return PipelineJobResult(
                jobId=job.jobId,
                status="failed",
                error=PipelineJobError(
                    code="RECOGNITION_FAILED",
                    message=str(recognition_result["error"]),
                ),
            )

        faces_data = recognition_result.get("faces", [])
        faces = [
            DetectedFace(
                boundingBox=BoundingBox(
                    x=f["bounding_box"]["x"],
                    y=f["bounding_box"]["y"],
                    width=f["bounding_box"]["width"],
                    height=f["bounding_box"]["height"],
                ),
                embedding=f["embedding"],
                confidence=f["confidence"],
            )
            for f in faces_data
        ]

        # Get image dimensions from recognition result (or auto-edit result)
        width = recognition_result.get("width")
        height = recognition_result.get("height")

        # auto_edit_succeeded reflects whether any processing was applied (auto-edit or LUT)
        any_processing_succeeded = auto_edit_succeeded or lut_applied
        artifacts = PipelineJobArtifacts(
            originalR2Key=job.originalR2Key,
            processedR2Key=job.processedR2Key if any_processing_succeeded else None,
            autoEditSucceeded=auto_edit_succeeded,
            lutApplied=lut_applied,
            lutId=job.options.lutId if job.options and lut_applied else None,
            lutIntensity=job.options.lutIntensity if job.options and lut_applied else None,
            embeddingCount=len(faces),
            faces=faces,
            exif=recognition_result.get("exif"),
            width=width,
            height=height,
        )

        if _jobs_total:
            _jobs_total.add(1, {"status": "completed"})

        return PipelineJobResult(
            jobId=job.jobId,
            status="completed",
            artifacts=artifacts,
        )

    except Exception as exc:
        if _jobs_total:
            _jobs_total.add(1, {"status": "failed"})
        if _errors_total:
            _errors_total.add(1, {"step": "orchestration", "code": "ORCHESTRATION_FAILED"})
        return PipelineJobResult(
            jobId=job.jobId,
            status="failed",
            error=PipelineJobError(
                code="ORCHESTRATION_FAILED",
                message=str(exc),
            ),
        )


async def post_callback(
    callback: CallbackTarget,
    payload: PipelineCallback,
) -> None:
    """Post callback to CF."""
    import httpx

    headers = {"Content-Type": "application/json"}
    if callback.token:
        headers["Authorization"] = f"Bearer {callback.token}"

    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        await client.post(callback.url, json=payload.model_dump(), headers=headers)


# ============================================================================
# Modal Function
# ============================================================================


@app.function(
    image=image,
    cpu=1.0,
    memory=1024,
    timeout=180,
    max_containers=10,
    secrets=[modal.Secret.from_name("framefast-observability")],
)
@modal.fastapi_endpoint(method="POST")
async def process_job(request: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single recognition job."""
    _init_observability()

    req = PipelineSingleJobRequest.model_validate(request)
    job_start = time.monotonic()

    parent_context = _parse_traceparent(req.traceparent)

    if _tracer and parent_context:
        from opentelemetry import trace as trace_api

        with _tracer.start_as_current_span(
            "orchestrator.process_job",
            context=parent_context,
            attributes={
                "job.id": req.job.jobId,
                "job.event_id": req.job.eventId,
                "job.photo_id": req.job.photoId or "",
            },
        ) as job_span:
            result = await process_single_job(req.job)

            job_duration = (time.monotonic() - job_start) * 1000
            if _batch_duration:
                _batch_duration.record(job_duration, {})

            job_span.set_attribute("job.status", result.status)
            if result.artifacts:
                job_span.set_attribute("job.face_count", result.artifacts.embeddingCount)
            if result.status == "failed":
                job_span.set_status(trace_api.StatusCode.ERROR)
                if result.error:
                    job_span.set_attribute("error.code", result.error.code)

            # Propagate trace context to callback
            ctx = job_span.get_span_context()
            cb_traceparent = f"00-{format(ctx.trace_id, '032x')}-{format(ctx.span_id, '016x')}-01"
    else:
        result = await process_single_job(req.job)
        job_duration = (time.monotonic() - job_start) * 1000
        if _batch_duration:
            _batch_duration.record(job_duration, {})
        cb_traceparent = req.traceparent

    callback_payload = PipelineCallback(
        results=[result],
        traceparent=cb_traceparent,
        baggage=req.baggage,
    )
    await post_callback(req.callback, callback_payload)

    # Force flush spans before container may shut down
    if _tracer_provider:
        _tracer_provider.force_flush(timeout_millis=5000)

    return {"status": "ok", "processed": 1}


@app.function(image=image)
def health() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "framefast-orchestrator",
        "environment": os.getenv("NODE_ENV", "production"),
    }
