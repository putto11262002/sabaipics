"""FrameFast Upload Orchestrator V2 (batch processing)."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Literal, Optional

import modal
from pydantic import BaseModel

app = modal.App("framefast-orchestrator")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi>=0.109.0",
    "httpx>=0.28.0",
    "pydantic>=2.0.0",
    "numpy>=1.26.0",
)


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


# ============================================================================
# Helper Functions
# ============================================================================


async def call_image_pipeline(job: PipelineJob) -> Dict[str, Any]:
    """Call image pipeline via Modal native Function.from_name()."""
    process_fn = modal.Function.from_name("framefast-image-pipeline", "process_internal")

    # Headers MUST match what was used to sign the presigned URL
    # CF generates presigned URLs with: Content-Type: image/jpeg, If-None-Match: *
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
    """Process a single job: image pipeline → recognition → result."""
    try:
        # Call image pipeline
        image_result = await call_image_pipeline(job)

        if isinstance(image_result, dict) and image_result.get("error"):
            return PipelineJobResult(
                jobId=job.jobId,
                status="failed",
                error=PipelineJobError(
                    code="IMAGE_PIPELINE_FAILED",
                    message=str(image_result["error"]),
                ),
            )

        # Determine if auto-edit succeeded
        auto_edit_succeeded = image_result.get("auto_edit_succeeded")

        # Call recognition on normalized image (reads from shared volume)
        recognition_result = await call_recognition(job)

        if isinstance(recognition_result, dict) and recognition_result.get("error"):
            return PipelineJobResult(
                jobId=job.jobId,
                status="failed",
                error=PipelineJobError(
                    code="RECOGNITION_FAILED",
                    message=str(recognition_result["error"]),
                ),
            )

        # Extract face data
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

        # Build artifacts
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

        return PipelineJobResult(
            jobId=job.jobId,
            status="completed",
            artifacts=artifacts,
        )

    except Exception as exc:
        return PipelineJobResult(
            jobId=job.jobId,
            status="failed",
            error=PipelineJobError(
                code="ORCHESTRATION_FAILED",
                message=str(exc),
            ),
        )


async def post_callback(callback: CallbackTarget, payload: PipelineBatchCallback) -> None:
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
)
@modal.fastapi_endpoint(method="POST")
async def process_batch(request: Dict[str, Any]) -> Dict[str, Any]:
    """Process a batch of upload jobs in parallel."""
    req = PipelineBatchRequest.model_validate(request)

    # Process all jobs in parallel
    results = await asyncio.gather(*[process_single_job(job) for job in req.jobs])

    # Post callback
    callback_payload = PipelineBatchCallback(results=list(results))
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
