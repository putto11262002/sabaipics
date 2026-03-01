"""Test script for image pipeline - run locally to test processing."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from PIL import Image

from image_pipeline.auto_edit import StylePreset, auto_edit
from image_pipeline.lut import ApplyLutOptions, apply_lut, parse_cube_lut
from image_pipeline.upscale import UpscaleOptions, upscale


def main() -> None:
    parser = argparse.ArgumentParser(description="Test image pipeline")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("--output", "-o", default="output.jpg", help="Output path")

    # Auto-edit options
    parser.add_argument("--auto-edit", action="store_true", help="Enable auto-edit")
    parser.add_argument(
        "--style",
        "-s",
        choices=[e.value for e in StylePreset],
        help="Style preset (neutral, warm, cool, vibrant, film, portrait, high_contrast, soft)",
    )
    parser.add_argument("--contrast", type=float, help="Contrast (0.5-2.0, 1.0=no change)")
    parser.add_argument("--brightness", type=float, help="Brightness (0.5-2.0, 1.0=no change)")
    parser.add_argument("--saturation", type=float, help="Saturation (0.5-2.0, 1.0=no change)")
    parser.add_argument("--sharpness", type=float, help="Sharpness (0.5-2.0, 1.0=no change)")
    parser.add_argument("--auto-contrast", action="store_true", help="Auto-stretch histogram")

    # LUT options
    parser.add_argument("--lut", help="Path to .cube LUT file")
    parser.add_argument("--lut-intensity", type=float, default=100, help="LUT intensity 0-100")
    parser.add_argument("--lut-preserve-luma", action="store_true", help="Preserve luminance")

    # Upscale options
    parser.add_argument("--upscale", action="store_true", help="Enable upscale")
    parser.add_argument("--upscale-scale", type=int, default=2, help="Upscale factor (default 2)")

    args = parser.parse_args()

    img = Image.open(args.input)
    print(f"Input: {img.size[0]}x{img.size[1]}")

    # Auto-edit
    if args.auto_edit or args.style:
        style = StylePreset(args.style) if args.style else None
        img = auto_edit(
            img,
            style,
            contrast=args.contrast,
            brightness=args.brightness,
            saturation=args.saturation,
            sharpness=args.sharpness,
            auto_contrast=args.auto_contrast if args.auto_contrast else None,
        )
        print(f"Applied auto-edit (style={args.style or 'neutral'})")

    # LUT
    if args.lut:
        with open(args.lut) as f:
            lut = parse_cube_lut(f.read())
        img = apply_lut(
            img,
            lut,
            ApplyLutOptions(
                intensity=args.lut_intensity,
                preserve_luminance=args.lut_preserve_luma,
            ),
        )
        print(f"Applied LUT: {args.lut} ({args.lut_intensity}%)")

    # Upscale
    if args.upscale:
        img = upscale(img, UpscaleOptions(scale=args.upscale_scale))
        print(f"Applied upscale ({args.upscale_scale}x)")

    img.save(args.output, quality=90)
    print(f"Output: {img.size[0]}x{img.size[1]} saved to {args.output}")


if __name__ == "__main__":
    main()
