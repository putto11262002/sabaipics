"""FrameFast Upload Orchestrator V2 (batch processing)."""

from __future__ import annotations

import asyncio
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
_meter = None

# Metrics (set after init)
_jobs_total = None
_step_duration = None
_batch_duration = None
_errors_total = None


def _init_observability() -> None:
    global _OBSERVABILITY_READY, _tracer, _meter
    global _jobs_total, _step_duration, _batch_duration, _errors_total

    if _OBSERVABILITY_READY:
        return

    otlp_endpoint = os.getenv("OTLP_ENDPOINT")
    otlp_user = os.getenv("OTLP_USER")
    otlp_token = os.getenv("OTLP_TOKEN")
    if not otlp_endpoint or not otlp_user or not otlp_token:
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
            "service.version": "2.0.0",
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
        tracer_provider = TracerProvider(resource=resource, sampler=sampler)
        tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
        trace.set_tracer_provider(tracer_provider)
        _tracer = trace.get_tracer("framefast-orchestrator", "2.0.0")

        # Metrics
        metrics_endpoint = otlp_endpoint.rstrip("/")
        if not metrics_endpoint.endswith("/v1/metrics"):
            metrics_endpoint = metrics_endpoint + "/v1/metrics"

        metric_exporter = OTLPMetricExporter(
            endpoint=metrics_endpoint,
            headers={"Authorization": f"Basic {auth_b64}"},
        )
        reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=15000)
        meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
        metrics.set_meter_provider(meter_provider)
        _meter = metrics.get_meter("framefast-orchestrator", "2.0.0")

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
# V2 Models (batch processing)
# ============================================================================


class CallbackTarget(BaseModel):
    url: str
    token: Optional[str] = None


class PipelineJobOptions(BaseModel):
    autoEdit: Optional[bool] = None
    autoEditIntensity: Optional[int] = None
    lutId: Optional[str] = None
    lutIntensity: Optional[int] = None
    maxFaces: Optional[int] = None


class PipelineJob(BaseModel):
    jobId: str
    eventId: str
    photographerId: str
    source: Literal["web", "ios", "ftp"]
    inputUrl: str
    originalPutUrl: str
    processedPutUrl: Optional[str] = None
    sourceR2Key: str
    originalR2Key: str
    processedR2Key: Optional[str] = None
    contentType: str
    options: Optional[PipelineJobOptions] = None


class PipelineBatchRequest(BaseModel):
    jobs: List[PipelineJob]
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


class PipelineBatchCallback(BaseModel):
    results: List[PipelineJobResult]
    traceparent: Optional[str] = None
    baggage: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


async def call_image_pipeline(job: PipelineJob) -> Dict[str, Any]:
    """Call image pipeline via Modal native Function.from_name()."""
    process_fn = modal.Function.from_name("framefast-image-pipeline", "process_internal")

    output_headers = {
        "Content-Type": "image/jpeg",
        "If-None-Match": "*",
    }

    options = {
        "normalize_max_px": 2500,
        "auto_edit": bool(job.options.autoEdit) if job.options else False,
        "auto_edit_intensity": job.options.autoEditIntensity if job.options else 100,
        "lut_id": job.options.lutId if job.options else None,
        "lut_intensity": job.options.lutIntensity if job.options else 100,
        "lut_preserve_luminance": False,
    }

    result = await process_fn.remote.aio(
        input_url=job.inputUrl,
        output_url=job.originalPutUrl,
        output_headers=output_headers,
        options=options,
        processed_output_url=job.processedPutUrl,
        processed_output_headers=output_headers if job.processedPutUrl else None,
        job_id=job.jobId,
    )

    return result


async def call_recognition(job: PipelineJob) -> Dict[str, Any]:
    """Call recognition via Modal native Function.from_name().

    Reads normalized image from shared volume (written by image pipeline).
    """
    extract_fn = modal.Function.from_name("framefast-recognition", "extract_internal")

    max_faces = job.options.maxFaces if job.options and job.options.maxFaces else 100

    result = await extract_fn.remote.aio(
        volume_path=f"/vol/{job.jobId}/normalized.jpeg",
        max_faces=max_faces,
        min_confidence=0.5,
    )

    return result


async def process_single_job(job: PipelineJob) -> PipelineJobResult:
    """Process a single job: image pipeline -> recognition -> result."""
    _init_observability()

    try:
        # Image pipeline
        start = time.monotonic()
        image_result = await call_image_pipeline(job)
        ip_duration = (time.monotonic() - start) * 1000
        if _step_duration:
            _step_duration.record(ip_duration, {"step": "image_pipeline", "status": "ok"})

        if isinstance(image_result, dict) and image_result.get("error"):
            if _errors_total:
                _errors_total.add(1, {"step": "image_pipeline", "code": "IMAGE_PIPELINE_FAILED"})
            return PipelineJobResult(
                jobId=job.jobId,
                status="failed",
                error=PipelineJobError(
                    code="IMAGE_PIPELINE_FAILED",
                    message=str(image_result["error"]),
                ),
            )

        auto_edit_succeeded = image_result.get("auto_edit_succeeded")

        # Recognition
        start = time.monotonic()
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

        artifacts = PipelineJobArtifacts(
            originalR2Key=job.originalR2Key,
            processedR2Key=job.processedR2Key if auto_edit_succeeded else None,
            autoEditSucceeded=auto_edit_succeeded,
            embeddingCount=len(faces),
            faces=faces,
            exif=image_result.get("exif"),
            width=image_result.get("width"),
            height=image_result.get("height"),
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
    payload: PipelineBatchCallback,
) -> None:
    """Post batch callback to CF."""
    import httpx

    headers = {"Content-Type": "application/json"}
    if callback.token:
        headers["Authorization"] = f"Bearer {callback.token}"

    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        await client.post(callback.url, json=payload.model_dump(), headers=headers)


# ============================================================================
# Modal Function (V2 batch processing)
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
async def process_batch(request: Dict[str, Any]) -> Dict[str, Any]:
    """Process a batch of upload jobs in parallel."""
    _init_observability()

    req = PipelineBatchRequest.model_validate(request)
    batch_start = time.monotonic()

    # Continue trace from CF
    parent_context = _parse_traceparent(req.traceparent)

    if _tracer and parent_context:
        from opentelemetry import trace as trace_api
        with _tracer.start_as_current_span(
            "orchestrator.process_batch",
            context=parent_context,
            attributes={
                "batch.size": len(req.jobs),
            },
        ) as batch_span:
            results = await asyncio.gather(*[process_single_job(job) for job in req.jobs])

            completed = sum(1 for r in results if r.status == "completed")
            failed = sum(1 for r in results if r.status == "failed")
            batch_span.set_attribute("batch.completed", completed)
            batch_span.set_attribute("batch.failed", failed)

            if failed > 0:
                batch_span.set_status(trace_api.StatusCode.ERROR)

            # Get current span's traceparent for callback propagation
            current_span = trace_api.get_current_span()
            ctx = current_span.get_span_context()
            cb_traceparent = f"00-{format(ctx.trace_id, '032x')}-{format(ctx.span_id, '016x')}-01"
    else:
        results = await asyncio.gather(*[process_single_job(job) for job in req.jobs])
        cb_traceparent = req.traceparent

    batch_duration = (time.monotonic() - batch_start) * 1000
    if _batch_duration:
        _batch_duration.record(batch_duration, {})

    # Post callback with trace context
    callback_payload = PipelineBatchCallback(
        results=list(results),
        traceparent=cb_traceparent,
        baggage=req.baggage,
    )
    await post_callback(req.callback, callback_payload)

    return {"status": "ok", "processed": len(results)}


@app.function(image=image)
def health() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "framefast-orchestrator-v2",
        "environment": os.getenv("NODE_ENV", "production"),
    }
