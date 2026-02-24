"""Image upscaling module.

Currently a placeholder - can be extended with Real-ESRGAN or other upscalers.
"""

from dataclasses import dataclass

from PIL import Image


@dataclass
class UpscaleOptions:
    """Options for upscaling."""

    scale: int = 2
    max_dimension: int = 4000


def upscale(img: Image.Image, options: UpscaleOptions | None = None) -> Image.Image:
    """Upscale an image.

    Currently uses Pillow's built-in resampling (Lanczos).
    Can be extended with Real-ESRGAN for ML-based upscaling.

    Args:
        img: Input PIL Image
        options: Upscale options

    Returns:
        Upscaled PIL Image
    """
    if options is None:
        options = UpscaleOptions()

    width, height = img.size
    new_width = width * options.scale
    new_height = height * options.scale

    if options.max_dimension:
        max_dim = max(new_width, new_height)
        if max_dim > options.max_dimension:
            ratio = options.max_dimension / max_dim
            new_width = int(new_width * ratio)
            new_height = int(new_height * ratio)

    return img.resize((new_width, new_height), Image.Resampling.LANCZOS)
