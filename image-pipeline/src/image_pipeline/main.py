"""Modal web endpoint for FrameFast image processing pipeline."""

from __future__ import annotations

import base64
import io
import urllib.request
from typing import Any

import modal

app = modal.App("framefast-image-pipeline")

image = (
    modal.Image.from_registry("python:3.11-slim")
    .pip_install(
        "pillow>=10.0.0",
        "numpy>=1.26.0",
        "colour-science>=0.4.3",
        "fastapi>=0.109.0",
        "pydantic>=2.0.0",
    )
    .add_local_dir("./src/image_pipeline", remote_path="/root/image_pipeline")
)


@app.function(
    image=image,
    cpu=2.0,
    memory=2048,
    timeout=60,
)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
def process(request: dict) -> dict:
    """Process an image with optional auto-edit, LUT, and upscale."""
    import sys

    sys.path.insert(0, "/root")

    from PIL import Image, ExifTags

    from image_pipeline.auto_edit import StylePreset, auto_edit
    from image_pipeline.lut import ApplyLutOptions, apply_lut, load_lut_from_bytes
    from image_pipeline.upscale import UpscaleOptions, upscale

    image_base64 = request.get("image_base64") or ""
    input_url = request.get("input_url")
    output_url = request.get("output_url")
    output_headers = request.get("output_headers") or {}
    options = request.get("options", {})

    if not input_url and not image_base64:
        return {"error": "input_url or image_base64 is required"}

    if not output_url:
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

    try:
        if input_url:
            with urllib.request.urlopen(input_url) as response:
                image_bytes = response.read()
        else:
            image_bytes = base64.b64decode(image_base64)

        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
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
                return {"error": f"Failed to upload output: {resp.status}"}
    except Exception as e:
        return {"error": f"Failed to upload output: {e}"}

    return {
        "width": img.width,
        "height": img.height,
        "format": format_name.lower(),
        "output_size": len(output_bytes),
        "operations_applied": operations_applied,
        "exif": exif_data,
    }


@app.function(image=image)
@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "framefast-image-pipeline"}
