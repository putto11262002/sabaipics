"""Auto-edit image enhancement using Pillow.

Provides automatic color/exposure correction with manual controls and style presets.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


class StylePreset(str, Enum):
    """Available style presets."""

    NEUTRAL = "neutral"
    WARM = "warm"
    COOL = "cool"
    VIBRANT = "vibrant"
    FILM = "film"
    PORTRAIT = "portrait"
    HIGH_CONTRAST = "high_contrast"
    SOFT = "soft"


@dataclass
class AutoEditOptions:
    """Options for auto-edit processing."""

    contrast: float = 1.0
    brightness: float = 1.0
    saturation: float = 1.0
    sharpness: float = 1.0
    auto_contrast: bool = False
    equalize: bool = False
    style: StylePreset | None = None

    @classmethod
    def from_preset(cls, style: StylePreset) -> "AutoEditOptions":
        """Create options from a style preset."""
        presets = {
            StylePreset.NEUTRAL: cls(
                contrast=1.0,
                brightness=1.0,
                saturation=1.0,
                sharpness=1.0,
                auto_contrast=False,
            ),
            StylePreset.WARM: cls(
                contrast=1.1,
                brightness=1.05,
                saturation=1.15,
                sharpness=1.1,
                auto_contrast=True,
            ),
            StylePreset.COOL: cls(
                contrast=1.1,
                brightness=1.0,
                saturation=1.1,
                sharpness=1.1,
                auto_contrast=True,
            ),
            StylePreset.VIBRANT: cls(
                contrast=1.2,
                brightness=1.05,
                saturation=1.4,
                sharpness=1.2,
                auto_contrast=True,
            ),
            StylePreset.FILM: cls(
                contrast=0.95,
                brightness=1.0,
                saturation=0.85,
                sharpness=0.9,
                auto_contrast=False,
            ),
            StylePreset.PORTRAIT: cls(
                contrast=1.05,
                brightness=1.05,
                saturation=1.1,
                sharpness=1.3,
                auto_contrast=True,
            ),
            StylePreset.HIGH_CONTRAST: cls(
                contrast=1.4,
                brightness=1.0,
                saturation=1.1,
                sharpness=1.2,
                auto_contrast=True,
            ),
            StylePreset.SOFT: cls(
                contrast=0.9,
                brightness=1.05,
                saturation=0.95,
                sharpness=0.8,
                auto_contrast=False,
            ),
        }
        options = presets.get(style, cls())
        options.style = style
        return options

    def with_overrides(
        self,
        contrast: float | None = None,
        brightness: float | None = None,
        saturation: float | None = None,
        sharpness: float | None = None,
        auto_contrast: bool | None = None,
        equalize: bool | None = None,
    ) -> "AutoEditOptions":
        """Apply manual overrides to options."""
        return AutoEditOptions(
            contrast=contrast if contrast is not None else self.contrast,
            brightness=brightness if brightness is not None else self.brightness,
            saturation=saturation if saturation is not None else self.saturation,
            sharpness=sharpness if sharpness is not None else self.sharpness,
            auto_contrast=auto_contrast if auto_contrast is not None else self.auto_contrast,
            equalize=equalize if equalize is not None else self.equalize,
            style=self.style,
        )


def analyze_image(img: Image.Image) -> dict:
    """Analyze image to detect issues."""
    if img.mode != "RGB":
        img = img.convert("RGB")

    arr = np.array(img)

    r_hist = np.histogram(arr[:, :, 0], bins=256, range=(0, 256))[0]
    g_hist = np.histogram(arr[:, :, 1], bins=256, range=(0, 256))[0]
    b_hist = np.histogram(arr[:, :, 2], bins=256, range=(0, 256))[0]

    combined = r_hist + g_hist + b_hist
    total = combined.sum()

    if total == 0:
        return {"mean": 128, "dynamic_range": 255}

    cdf = np.cumsum(combined) / total

    p1 = np.searchsorted(cdf, 0.01)
    p99 = np.searchsorted(cdf, 0.99)

    mean_val = (p1 + p99) / 2
    dynamic_range = p99 - p1

    return {
        "mean": mean_val,
        "dynamic_range": dynamic_range,
        "underexposed": mean_val < 100,
        "overexposed": mean_val > 180,
        "low_contrast": dynamic_range < 150,
    }


def auto_edit(
    img: Image.Image,
    options: AutoEditOptions | StylePreset | None = None,
    *,
    contrast: float | None = None,
    brightness: float | None = None,
    saturation: float | None = None,
    sharpness: float | None = None,
    auto_contrast: bool | None = None,
    equalize: bool | None = None,
) -> Image.Image:
    """Apply auto-edit enhancements to an image.

    Args:
        img: Input PIL Image
        options: AutoEditOptions, StylePreset, or None (neutral)
        contrast: Override contrast (0.5-2.0, 1.0 = no change)
        brightness: Override brightness (0.5-2.0, 1.0 = no change)
        saturation: Override saturation (0.5-2.0, 1.0 = no change)
        sharpness: Override sharpness (0.5-2.0, 1.0 = no change)
        auto_contrast: Override auto_contrast
        equalize: Override equalize

    Returns:
        Enhanced PIL Image

    Examples:
        # Neutral (default)
        result = auto_edit(img)

        # Using preset
        result = auto_edit(img, StylePreset.WARM)

        # Manual params
        result = auto_edit(img, contrast=1.2, saturation=1.3)

        # Preset + overrides
        result = auto_edit(img, StylePreset.VIBRANT, saturation=1.6)
    """
    if options is None:
        opts = AutoEditOptions()
    elif isinstance(options, StylePreset):
        opts = AutoEditOptions.from_preset(options)
    else:
        opts = options

    opts = opts.with_overrides(
        contrast=contrast,
        brightness=brightness,
        saturation=saturation,
        sharpness=sharpness,
        auto_contrast=auto_contrast,
        equalize=equalize,
    )

    result = img.copy()

    if opts.auto_contrast:
        result = ImageOps.autocontrast(result, cutoff=0.5)

    if opts.equalize:
        result = ImageOps.equalize(result)

    if opts.brightness != 1.0:
        result = ImageEnhance.Brightness(result).enhance(opts.brightness)

    if opts.contrast != 1.0:
        result = ImageEnhance.Contrast(result).enhance(opts.contrast)

    if opts.saturation != 1.0:
        result = ImageEnhance.Color(result).enhance(opts.saturation)

    if opts.sharpness != 1.0:
        result = ImageEnhance.Sharpness(result).enhance(opts.sharpness)

    return result
