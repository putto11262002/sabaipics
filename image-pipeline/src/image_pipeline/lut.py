"""LUT (Look-Up Table) application using colour-science.

Supports .cube LUT files with trilinear interpolation and intensity blending.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class ApplyLutOptions:
    """Options for LUT application."""

    intensity: float = 100.0
    preserve_luminance: bool = False


@dataclass
class ParsedCubeLut:
    """Parsed .cube LUT data."""

    size: int
    domain_min: tuple[float, float, float]
    domain_max: tuple[float, float, float]
    data: np.ndarray


def parse_cube_lut(content: str) -> ParsedCubeLut:
    """Parse a .cube LUT file.

    Args:
        content: Raw .cube file content

    Returns:
        ParsedCubeLut with LUT data

    Raises:
        ValueError: If LUT format is invalid
    """
    lines = content.strip().split("\n")

    size = 33
    domain_min = (0.0, 0.0, 0.0)
    domain_max = (1.0, 1.0, 1.0)
    data_start = 0

    for i, line in enumerate(lines):
        line = line.strip()
        if line.startswith("#") or not line:
            continue

        if line.upper().startswith("LUT_3D_SIZE"):
            size = int(line.split()[1])
        elif line.upper().startswith("DOMAIN_MIN"):
            parts = line.split()[1:]
            domain_min = tuple(float(x) for x in parts[:3])
        elif line.upper().startswith("DOMAIN_MAX"):
            parts = line.split()[1:]
            domain_max = tuple(float(x) for x in parts[:3])
        elif re.match(r"^[\d\.\-]", line):
            data_start = i
            break

    lut_data = []
    for line in lines[data_start:]:
        line = line.strip()
        if line and not line.startswith("#"):
            parts = line.split()
            if len(parts) >= 3:
                lut_data.append([float(x) for x in parts[:3]])

    if len(lut_data) != size**3:
        raise ValueError(f"Invalid LUT data: expected {size**3} entries, got {len(lut_data)}")

    lut_array = np.array(lut_data, dtype=np.float32).reshape((size, size, size, 3))

    return ParsedCubeLut(
        size=size,
        domain_min=domain_min,
        domain_max=domain_max,
        data=lut_array,
    )


def apply_lut(
    img: Image.Image,
    lut: ParsedCubeLut,
    options: ApplyLutOptions | None = None,
) -> Image.Image:
    """Apply a LUT to an image using vectorized numpy operations.

    Args:
        img: Input PIL Image
        lut: Parsed LUT data
        options: Application options (intensity, luminance preservation)

    Returns:
        Image with LUT applied
    """
    if options is None:
        options = ApplyLutOptions()

    intensity = options.intensity / 100.0

    if img.mode != "RGB":
        img = img.convert("RGB")

    arr = np.array(img, dtype=np.float32) / 255.0
    h, w = arr.shape[:2]

    domain_min = np.array(lut.domain_min)
    domain_max = np.array(lut.domain_max)
    domain_range = domain_max - domain_min

    normalized = (arr - domain_min) / domain_range
    normalized = np.clip(normalized, 0, 1)

    size = lut.size
    indices = normalized * (size - 1)

    x_idx = indices[:, :, 0]
    y_idx = indices[:, :, 1]
    z_idx = indices[:, :, 2]

    x0 = np.floor(x_idx).astype(int)
    y0 = np.floor(y_idx).astype(int)
    z0 = np.floor(z_idx).astype(int)

    x0 = np.clip(x0, 0, size - 2)
    y0 = np.clip(y0, 0, size - 2)
    z0 = np.clip(z0, 0, size - 2)

    xd = np.clip(x_idx - x0, 0, 1)
    yd = np.clip(y_idx - y0, 0, 1)
    zd = np.clip(z_idx - z0, 0, 1)

    c000 = lut.data[z0, y0, x0]
    c001 = lut.data[z0, y0, np.minimum(x0 + 1, size - 1)]
    c010 = lut.data[z0, np.minimum(y0 + 1, size - 1), x0]
    c011 = lut.data[z0, np.minimum(y0 + 1, size - 1), np.minimum(x0 + 1, size - 1)]
    c100 = lut.data[np.minimum(z0 + 1, size - 1), y0, x0]
    c101 = lut.data[np.minimum(z0 + 1, size - 1), y0, np.minimum(x0 + 1, size - 1)]
    c110 = lut.data[np.minimum(z0 + 1, size - 1), np.minimum(y0 + 1, size - 1), x0]
    c111 = lut.data[
        np.minimum(z0 + 1, size - 1),
        np.minimum(y0 + 1, size - 1),
        np.minimum(x0 + 1, size - 1),
    ]

    xd = xd[:, :, np.newaxis]
    yd = yd[:, :, np.newaxis]
    zd = zd[:, :, np.newaxis]

    c00 = c000 * (1 - xd) + c001 * xd
    c01 = c010 * (1 - xd) + c011 * xd
    c10 = c100 * (1 - xd) + c101 * xd
    c11 = c110 * (1 - xd) + c111 * xd

    c0 = c00 * (1 - yd) + c01 * yd
    c1 = c10 * (1 - yd) + c11 * yd

    lut_color = c0 * (1 - zd) + c1 * zd

    if options.preserve_luminance:
        orig_luma = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]
        lut_luma = (
            0.2126 * lut_color[:, :, 0] + 0.7152 * lut_color[:, :, 1] + 0.0722 * lut_color[:, :, 2]
        )

        lut_luma = np.where(lut_luma > 0.001, lut_luma, 1.0)
        scale = orig_luma / lut_luma
        lut_color = lut_color * scale[:, :, np.newaxis]

    result = arr * (1 - intensity) + lut_color * intensity
    result = np.clip(result * 255, 0, 255).astype(np.uint8)

    return Image.fromarray(result, mode="RGB")


def load_lut_from_bytes(content: bytes) -> ParsedCubeLut:
    """Load a LUT from .cube file bytes.

    Args:
        content: Raw .cube file bytes

    Returns:
        ParsedCubeLut
    """
    return parse_cube_lut(content.decode("utf-8"))
