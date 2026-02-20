/**
 * Blend original and graded images at a given intensity using canvas compositing.
 * Draws original at full opacity, then graded at `intensity/100` alpha.
 * Renders to the provided canvas element for zero encode overhead.
 */
export function blendToCanvas(params: {
  canvas: HTMLCanvasElement;
  original: HTMLImageElement;
  graded: HTMLImageElement;
  intensity: number; // 0-100
}): void {
  const { canvas, original, graded, intensity } = params;
  const width = original.naturalWidth;
  const height = original.naturalHeight;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);

  // Draw original at full opacity
  ctx.globalAlpha = 1;
  ctx.drawImage(original, 0, 0, width, height);

  // Draw graded on top at intensity alpha
  if (intensity > 0) {
    ctx.globalAlpha = intensity / 100;
    ctx.drawImage(graded, 0, 0, width, height);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
