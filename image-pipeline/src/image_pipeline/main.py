"""Modal web endpoint for FrameFast image processing pipeline."""

from __future__ import annotations

import base64
import io
import os
import time
import urllib.request
from typing import Any

import modal

app = modal.App("framefast-image-pipeline")
_OBSERVABILITY_READY = False
_TRACER = None
_REQUEST_COUNTER = None
_ERROR_COUNTER = None
_REQUEST_LATENCY_MS = None
_OUTPUT_SIZE_BYTES = None

image = (
    modal.Image.from_registry("python:3.11-slim")
    .pip_install(
        "pillow>=10.0.0",
        "numpy>=1.26.0",
        "colour-science>=0.4.3",
        "fastapi>=0.109.0",
        "pydantic>=2.0.0",
        "opentelemetry-api>=1.36.0",
        "opentelemetry-sdk>=1.36.0",
        "opentelemetry-exporter-otlp-proto-http>=1.36.0",
    )
    .add_local_dir("./src/image_pipeline", remote_path="/root/image_pipeline")
)


@app.function(
    image=image,
    cpu=2.0,
    memory=2048,
    timeout=60,
    secrets=[modal.Secret.from_name("framefast-observability")],
)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
def process(request: dict) -> dict:
    """Process an image with optional auto-edit, LUT, and upscale."""
    import sys
    from typing import Optional

    sys.path.insert(0, "/root")

    from PIL import Image, ExifTags
    from opentelemetry import metrics, trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.trace import SpanContext, TraceFlags, TraceState, NonRecordingSpan, set_span_in_context
    from opentelemetry.trace.span import INVALID_SPAN_CONTEXT

    from image_pipeline.auto_edit import StylePreset, auto_edit
    from image_pipeline.lut import ApplyLutOptions, apply_lut, load_lut_from_bytes
    from image_pipeline.upscale import UpscaleOptions, upscale

    global _OBSERVABILITY_READY
    global _TRACER
    global _REQUEST_COUNTER
    global _ERROR_COUNTER
    global _REQUEST_LATENCY_MS
    global _OUTPUT_SIZE_BYTES

    def resolve_otlp_endpoint(raw: str, signal: str) -> str:
        normalized = raw.strip().rstrip("/")
        if normalized.endswith(f"/v1/{signal}"):
            return normalized
        if normalized.endswith("/otlp"):
            return f"{normalized}/v1/{signal}"
        if normalized.endswith("/tempo"):
            return f"{normalized[:-len('/tempo')]}/otlp/v1/{signal}"
        return f"{normalized}/v1/{signal}"

    def setup_observability_if_needed():
        global _OBSERVABILITY_READY
        global _TRACER
        global _REQUEST_COUNTER
        global _ERROR_COUNTER
        global _REQUEST_LATENCY_MS
        global _OUTPUT_SIZE_BYTES

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
            print("[otel] disabled for image-pipeline (missing traces env vars)")
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
                "service.name": "framefast-image-pipeline",
                "service.version": "1.0.0",
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
        _TRACER = trace.get_tracer("framefast-image-pipeline", "1.0.0")

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
            meter = metrics.get_meter("framefast-image-pipeline", "1.0.0")
            _REQUEST_COUNTER = meter.create_counter(
                "framefast_image_pipeline_requests_total",
                unit="1",
                description="Total image pipeline requests",
            )
            _ERROR_COUNTER = meter.create_counter(
                "framefast_image_pipeline_errors_total",
                unit="1",
                description="Total image pipeline errors",
            )
            _REQUEST_LATENCY_MS = meter.create_histogram(
                "framefast_image_pipeline_request_latency_ms",
                unit="ms",
                description="Image pipeline request latency",
            )
            _OUTPUT_SIZE_BYTES = meter.create_histogram(
                "framefast_image_pipeline_output_bytes",
                unit="By",
                description="Image pipeline output payload bytes",
            )
        else:
            print("[otel] metrics disabled for image-pipeline (missing metrics env vars)")

        _OBSERVABILITY_READY = True
        print("[otel] image-pipeline tracing configured")

    def parse_traceparent(traceparent: Optional[str]) -> Optional[SpanContext]:
        if not traceparent:
            return None
        parts = traceparent.strip().split("-")
        if len(parts) != 4:
            return None
        try:
            trace_id = int(parts[1], 16)
            span_id = int(parts[2], 16)
            flags = int(parts[3], 16)
        except ValueError:
            return None
        if trace_id == 0 or span_id == 0:
            return None
        return SpanContext(
            trace_id=trace_id,
            span_id=span_id,
            is_remote=True,
            trace_flags=TraceFlags(flags),
            trace_state=TraceState(),
        )

    setup_observability_if_needed()
    tracer = _TRACER or trace.get_tracer("framefast-image-pipeline", "1.0.0")
    request_start = time.time()
    incoming_traceparent = request.get("traceparent")
    incoming_baggage = request.get("baggage")
    parent_span_context = parse_traceparent(incoming_traceparent)
    parent_ctx = (
        set_span_in_context(NonRecordingSpan(parent_span_context))
        if parent_span_context is not None
        else set_span_in_context(NonRecordingSpan(INVALID_SPAN_CONTEXT))
    )

    def record_metrics(status: str, output_size: int | None = None):
        attrs = {"route": "/process", "status": status}
        elapsed_ms = (time.time() - request_start) * 1000
        if _REQUEST_COUNTER is not None:
            _REQUEST_COUNTER.add(1, attrs)
        if _REQUEST_LATENCY_MS is not None:
            _REQUEST_LATENCY_MS.record(elapsed_ms, attrs)
        if status != "ok" and _ERROR_COUNTER is not None:
            _ERROR_COUNTER.add(1, attrs)
        if output_size is not None and _OUTPUT_SIZE_BYTES is not None:
            _OUTPUT_SIZE_BYTES.record(output_size, attrs)

    image_base64 = request.get("image_base64") or ""
    input_url = request.get("input_url")
    output_url = request.get("output_url")
    output_headers = request.get("output_headers") or {}
    options = request.get("options", {})

    if not input_url and not image_base64:
        record_metrics("validation_error")
        return {"error": "input_url or image_base64 is required"}

    if not output_url:
        record_metrics("validation_error")
        return {"error": "output_url is required"}

    def _rational_to_float(value):
        try:
            if isinstance(value, tuple) and len(value) == 2:
                num = value[0]
                den = value[1]
                if den == 0:
                    return None
                return float(num) / float(den)
            if hasattr(value, "numerator") and hasattr(value, "denominator"):
                val: Any = value
                den = getattr(val, "denominator", 0)
                if den == 0:
                    return None
                num = getattr(val, "numerator", 0)
                return float(num) / float(den)
            if isinstance(value, (int, float, str)):
                return float(value)
            return None
        except Exception:
            return None

    def _gps_to_degrees(value):
        if not isinstance(value, (tuple, list)) or len(value) != 3:
            return None
        d = _rational_to_float(value[0])
        m = _rational_to_float(value[1])
        s = _rational_to_float(value[2])
        if d is None or m is None or s is None:
            return None
        return d + (m / 60.0) + (s / 3600.0)

    def extract_exif(img):
        try:
            raw = img.getexif()
            if not raw:
                return None
            exif = {}
            gps_info = None
            for tag_id, value in raw.items():
                tag = ExifTags.TAGS.get(tag_id, tag_id)
                if tag == "GPSInfo":
                    gps_info = value
                    continue
                if tag == "Make":
                    exif["make"] = str(value)
                elif tag == "Model":
                    exif["model"] = str(value)
                elif tag == "LensModel":
                    exif["lensModel"] = str(value)
                elif tag == "FocalLength":
                    exif["focalLength"] = _rational_to_float(value)
                elif tag == "ISOSpeedRatings":
                    exif["iso"] = int(value) if value is not None else None
                elif tag == "FNumber":
                    exif["fNumber"] = _rational_to_float(value)
                elif tag == "ExposureTime":
                    exif["exposureTime"] = _rational_to_float(value)
                elif tag == "DateTimeOriginal":
                    exif["dateTimeOriginal"] = str(value)

            if gps_info:
                gps = {}
                for k, v in gps_info.items():
                    gps_tag = ExifTags.GPSTAGS.get(k, k)
                    gps[gps_tag] = v

                lat = _gps_to_degrees(gps.get("GPSLatitude"))
                lat_ref = gps.get("GPSLatitudeRef")
                lon = _gps_to_degrees(gps.get("GPSLongitude"))
                lon_ref = gps.get("GPSLongitudeRef")
                if lat is not None and lat_ref in ["S", "s"]:
                    lat = -lat
                if lon is not None and lon_ref in ["W", "w"]:
                    lon = -lon

                if lat is not None:
                    exif["gpsLatitude"] = lat
                if lon is not None:
                    exif["gpsLongitude"] = lon

            return exif if exif else None
        except Exception:
            return None

    with tracer.start_as_current_span("modal.process", context=parent_ctx) as span:
        if incoming_traceparent:
            span.set_attribute("framefast.traceparent_in", str(incoming_traceparent))
        if incoming_baggage:
            span.set_attribute("framefast.baggage_in", str(incoming_baggage))
        span.set_attribute("framefast.source", "input_url" if input_url else "image_base64")

        try:
            if input_url:
                with urllib.request.urlopen(input_url) as response:
                    image_bytes = response.read()
            else:
                image_bytes = base64.b64decode(image_base64)

            img = Image.open(io.BytesIO(image_bytes))
        except Exception as e:
            record_metrics("invalid_image")
            span.record_exception(e)
            span.set_attribute("framefast.status", "invalid_image")
            return {"error": f"Invalid image: {e}"}

        exif_data = extract_exif(img)

        operations_applied = []

        max_dimension = options.get("normalize_max_px", 2500)
        try:
            max_dimension = int(max_dimension)
        except Exception:
            max_dimension = 2500

        if max_dimension and max_dimension > 0:
            if img.width > max_dimension or img.height > max_dimension:
                resample = Image.Resampling.LANCZOS
                img.thumbnail((max_dimension, max_dimension), resample)
                operations_applied.append("normalize")

            if options.get("auto_edit"):
                original_for_auto_edit = img.copy()
                style_name = options.get("style")
                style = StylePreset(style_name) if style_name else None
                img = auto_edit(
                    img,
                    style,
                    contrast=options.get("contrast"),
                    brightness=options.get("brightness"),
                    saturation=options.get("saturation"),
                    sharpness=options.get("sharpness"),
                    auto_contrast=options.get("auto_contrast"),
                )

                auto_edit_intensity = float(options.get("auto_edit_intensity", 100.0))
                auto_edit_intensity = max(0.0, min(100.0, auto_edit_intensity))
                if auto_edit_intensity < 100.0:
                    alpha = auto_edit_intensity / 100.0
                    img = Image.blend(original_for_auto_edit.convert("RGB"), img.convert("RGB"), alpha)

                operations_applied.append("auto_edit")

            lut_base64 = options.get("lut_base64")
            if lut_base64:
                try:
                    lut_bytes = base64.b64decode(lut_base64)
                    lut = load_lut_from_bytes(lut_bytes)
                    lut_options = ApplyLutOptions(
                        intensity=options.get("lut_intensity", 100.0),
                        preserve_luminance=options.get("lut_preserve_luminance", False),
                    )
                    img = apply_lut(img, lut, lut_options)
                    operations_applied.append("lut")
                except Exception as e:
                    record_metrics("invalid_lut")
                    span.record_exception(e)
                    span.set_attribute("framefast.status", "invalid_lut")
                    return {"error": f"Invalid LUT: {e}"}

            if options.get("upscale"):
                upscale_options = UpscaleOptions(scale=options.get("upscale_scale", 2))
                img = upscale(img, upscale_options)
                operations_applied.append("upscale")

            output = io.BytesIO()
            format_name = options.get("output_format", "jpeg").upper()
            quality = options.get("output_quality", 90)

            if format_name == "JPEG":
                img = img.convert("RGB")
                img.save(output, format="JPEG", quality=quality)
            elif format_name == "PNG":
                img.save(output, format="PNG")
            elif format_name == "WEBP":
                img.save(output, format="WEBP", quality=quality)
            else:
                record_metrics("unsupported_format")
                span.set_attribute("framefast.status", "unsupported_format")
                return {"error": f"Unsupported format: {format_name}"}

            output.seek(0)
            output_bytes = output.read()

            try:
                req = urllib.request.Request(
                    output_url,
                    data=output_bytes,
                    method="PUT",
                    headers=output_headers,
                )
                with urllib.request.urlopen(req) as resp:
                    if resp.status >= 400:
                        record_metrics("upload_failed")
                        span.set_attribute("framefast.status", "upload_failed")
                        return {"error": f"Failed to upload output: {resp.status}"}
            except Exception as e:
                record_metrics("upload_failed")
                span.record_exception(e)
                span.set_attribute("framefast.status", "upload_failed")
                return {"error": f"Failed to upload output: {e}"}

            span.set_attribute("framefast.status", "ok")
            span.set_attribute("framefast.output_size", len(output_bytes))
            span.set_attribute("framefast.output_format", format_name.lower())
            span.set_attribute("framefast.operations_count", len(operations_applied))
            for idx, op in enumerate(operations_applied):
                span.set_attribute(f"framefast.operation.{idx}", op)
            record_metrics("ok", output_size=len(output_bytes))
            return {
                "width": img.width,
                "height": img.height,
                "format": format_name.lower(),
                "output_size": len(output_bytes),
                "operations_applied": operations_applied,
                "exif": exif_data,
            }


@app.function(image=image, secrets=[modal.Secret.from_name("framefast-observability")])
@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "framefast-image-pipeline"}
